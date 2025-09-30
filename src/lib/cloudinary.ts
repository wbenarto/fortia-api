import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Image optimization settings for meal photos
export const MEAL_IMAGE_CONFIG = {
  // Transformation options for meal images
  transformation: {
    width: 800,
    height: 800,
    crop: 'limit', // Don't crop, just resize if needed
    quality: 'auto:good', // Auto quality optimization
    format: 'auto', // Auto format selection (WebP, AVIF, etc.)
  },
  // Upload options
  uploadOptions: {
    folder: 'fortia/meals',
    resource_type: 'image' as const,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    max_file_size: 10 * 1024 * 1024, // 10MB limit
  },
  // Security options
  security: {
    // Add user-specific tags for tracking
    tags: (clerkId: string) => [`user:${clerkId}`, 'meal-photo', 'fortia'],
    // Add context for better organization
    context: (clerkId: string, mealId?: string) => ({
      user_id: clerkId,
      meal_id: mealId || 'unknown',
      app: 'fortia',
      upload_source: 'api',
    }),
  },
};

// Upload image to Cloudinary with security and optimization
export const uploadMealImage = async (
  imageBuffer: Buffer,
  clerkId: string,
  mealId?: string
): Promise<{ url: string; publicId: string }> => {
  try {
    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
      {
        ...MEAL_IMAGE_CONFIG.uploadOptions,
        transformation: [MEAL_IMAGE_CONFIG.transformation],
        tags: MEAL_IMAGE_CONFIG.security.tags(clerkId),
        context: MEAL_IMAGE_CONFIG.security.context(clerkId, mealId),
        // Add timestamp for uniqueness
        public_id: `meal_${clerkId}_${Date.now()}`,
      }
    );

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Delete image from Cloudinary
export const deleteMealImage = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
};

// Get image info from Cloudinary
export const getImageInfo = async (publicId: string) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary get info error:', error);
    return null;
  }
};

// Validate image file
export const validateImageFile = (file: Express.Multer.File): { valid: boolean; error?: string } => {
  // Check file size (10MB limit)
  if (file.size > MEAL_IMAGE_CONFIG.uploadOptions.max_file_size) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return { valid: false, error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed' };
  }

  // Check if file has content
  if (!file.buffer || file.buffer.length === 0) {
    return { valid: false, error: 'Empty file' };
  }

  return { valid: true };
};

export default cloudinary;
