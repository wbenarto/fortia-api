import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { uploadMealImage, validateImageFile } from '@/lib/cloudinary';
import { ErrorResponses, handleDatabaseError } from '@/lib/errorUtils';
import { extractClerkId, validateClerkId } from '@/lib/authUtils';
import { Readable } from 'stream';

const sql = neon(process.env.DATABASE_URL!);

// Note: Multer configuration removed as we're using Next.js built-in FormData handling

// POST - Upload meal image
export async function POST(request: NextRequest) {
  try {
    // Parse the form data first to get clerkId
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const mealId = formData.get('mealId') as string;
    const clerkId = formData.get('clerkId') as string;

    // Authenticate user using clerkId from FormData
    if (!clerkId) {
      return ErrorResponses.unauthorized('Authentication required');
    }

    if (!validateClerkId(clerkId)) {
      return ErrorResponses.unauthorized('Invalid authentication');
    }

    if (!file) {
      return ErrorResponses.badRequest('No image file provided');
    }

    // Debug logging to understand what we're receiving
    console.log('File type:', typeof file);
    console.log('File constructor:', file?.constructor?.name);
    console.log('File keys:', file && typeof file === 'object' ? Object.keys(file) : 'N/A');
    console.log('File size:', file && typeof file === 'object' && 'size' in file ? file.size : 'N/A');
    console.log('Is Buffer:', Buffer.isBuffer(file));
    console.log('Has arrayBuffer method:', file && typeof file.arrayBuffer === 'function');

    // Handle file data - React Native sends file content directly
    let buffer: Buffer;
    
    if (file && typeof file.arrayBuffer === 'function') {
      // Web File object
      console.log('Processing as Web File object');
      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
    } else if (typeof file === 'string') {
      // Check if it's a URI (starts with http/https/file) or binary data
      const fileString = file as string;
      if (fileString.startsWith('http') || fileString.startsWith('file://') || fileString.startsWith('content://')) {
        // It's a URI - fetch the file
        console.log('Processing as URI string');
        try {
          const response = await fetch(fileString);
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } catch (error) {
          console.error('Error fetching file from URI:', error);
          return ErrorResponses.badRequest('Failed to process image file');
        }
      } else {
        // It's binary data as string (React Native FormData behavior)
        console.log('Processing as binary string data');
        try {
          buffer = Buffer.from(fileString, 'binary');
          console.log('Successfully converted binary string to Buffer, size:', buffer.length);
        } catch (error) {
          console.error('Error converting binary string to Buffer:', error);
          return ErrorResponses.badRequest('Invalid file format');
        }
      }
    } else if (Buffer.isBuffer(file)) {
      // File is already a Buffer (React Native direct data)
      console.log('Processing as Buffer');
      buffer = file;
    } else if (file && typeof file === 'object' && 'data' in file) {
      // React Native might send as object with data property
      console.log('Processing as object with data property');
      buffer = Buffer.from((file as any).data);
    } else {
      // Try to convert whatever we got to a Buffer
      console.log('Attempting fallback conversion to Buffer');
      try {
        buffer = Buffer.from(file as any);
        console.log('Successfully converted to Buffer, size:', buffer.length);
      } catch (error) {
        console.error('Error converting file to Buffer:', error);
        return ErrorResponses.badRequest('Invalid file format');
      }
    }

    // Create a mock file object for validation
    const mockFile: Express.Multer.File = {
      fieldname: 'image',
      originalname: (typeof file === 'object' && file && 'name' in file) ? file.name : 'image.jpg',
      encoding: '7bit',
      mimetype: (typeof file === 'object' && file && 'type' in file) ? file.type : 'image/jpeg',
      buffer: buffer,
      size: buffer.length,
      stream: null as unknown as Readable,
      destination: '',
      filename: '',
      path: '',
    };

    console.log('Mock file created:', {
      originalname: mockFile.originalname,
      mimetype: mockFile.mimetype,
      size: mockFile.size
    });

    // Validate the image file
    console.log('Validating image file...');
    const validation = validateImageFile(mockFile);
    console.log('Validation result:', validation);
    
    if (!validation.valid) {
      console.error('Image validation failed:', validation.error);
      return ErrorResponses.badRequest(validation.error || 'Invalid image file');
    }

    console.log('Image validation passed, proceeding to Cloudinary upload...');

    // Upload to Cloudinary
    let uploadResult;
    try {
      console.log('Starting Cloudinary upload...');
      uploadResult = await uploadMealImage(buffer, clerkId, mealId);
      console.log('Cloudinary upload successful:', uploadResult);
    } catch (error) {
      console.error('Cloudinary upload failed:', error);
      return ErrorResponses.badRequest('Failed to upload image to Cloudinary');
    }

    // If mealId is provided, update the meal record with the image URL
    if (mealId) {
      try {
        await sql`
          UPDATE meals 
          SET image_url = ${uploadResult.url}, updated_at = NOW()
          WHERE id = ${mealId} AND clerk_id = ${clerkId}
        `;
      } catch (dbError) {
        console.error('Database update error:', dbError);
        // Don't fail the upload if DB update fails, but log it
      }
    }

    // Log the upload for monitoring
    await sql`
      INSERT INTO api_logs (clerk_id, request_text, response_data, created_at)
      VALUES (${clerkId}, 'meal_image_upload', ${JSON.stringify({
        publicId: uploadResult.publicId,
        mealId: mealId || null,
        fileSize: buffer.length,
        mimeType: file.type,
      })}, NOW())
    `;

    return NextResponse.json({
      success: true,
      data: {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        mealId: mealId || null,
      },
    });
  } catch (error) {
    console.error('Image upload error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('File too large')) {
        return ErrorResponses.badRequest('File size exceeds 10MB limit');
      }
      if (error.message.includes('Invalid file type')) {
        return ErrorResponses.badRequest('Invalid file type. Only JPEG, PNG, and WebP are allowed');
      }
    }

    return handleDatabaseError(error);
  }
}

// DELETE - Delete meal image
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user using existing auth pattern
    const clerkId = extractClerkId(request);
    
    if (!clerkId) {
      return ErrorResponses.unauthorized('Authentication required');
    }

    if (!validateClerkId(clerkId)) {
      return ErrorResponses.unauthorized('Invalid authentication');
    }

    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('mealId');
    const publicId = searchParams.get('publicId');

    if (!publicId) {
      return ErrorResponses.badRequest('Public ID is required');
    }

    // If mealId is provided, get the current image URL from the database
    let imageUrl = null;
    if (mealId) {
      const meal = await sql`
        SELECT image_url FROM meals 
        WHERE id = ${mealId} AND clerk_id = ${clerkId}
      `;

      if (meal.length === 0) {
        return ErrorResponses.notFound('Meal not found');
      }

      imageUrl = meal[0].image_url;
    }

    // Use the provided publicId or extract from URL
    let imagePublicId = publicId;
    if (!imagePublicId && imageUrl) {
      // Extract public ID from Cloudinary URL
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      imagePublicId = filename.split('.')[0];
    }

    // Delete from Cloudinary if we have a public ID
    if (imagePublicId) {
      try {
        const { deleteMealImage } = await import('@/lib/cloudinary');
        await deleteMealImage(imagePublicId);
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
        // Continue with database update even if Cloudinary delete fails
      }
    }

    // Remove image URL from database only if mealId is provided
    if (mealId) {
      await sql`
        UPDATE meals 
        SET image_url = NULL, updated_at = NOW()
        WHERE id = ${mealId} AND clerk_id = ${clerkId}
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    return handleDatabaseError(error);
  }
}
