import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exerciseName = searchParams.get('exercise');

    if (!exerciseName) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cached = await sql`
      SELECT video_url, embed_url, video_id, video_title, use_count
      FROM exercise_video_cache
      WHERE exercise_name = ${exerciseName.toLowerCase()}
    `;

    if (cached.length > 0) {
      // Update usage stats
      await sql`
        UPDATE exercise_video_cache
        SET last_used_at = NOW(), use_count = use_count + 1
        WHERE exercise_name = ${exerciseName.toLowerCase()}
      `;

      return NextResponse.json({
        success: true,
        data: {
          videoUrl: cached[0].video_url,
          embedUrl: cached[0].embed_url,
          videoId: cached[0].video_id,
          videoTitle: cached[0].video_title,
          useCount: cached[0].use_count,
          cached: true,
        },
      });
    }

    // Fetch from YouTube API
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json(
        { error: 'YouTube API key not configured' },
        { status: 500 }
      );
    }

    const searchQuery = `${exerciseName} exercise tutorial`;
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('YouTube API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch video from YouTube', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return NextResponse.json(
        { error: 'No video found for this exercise' },
        { status: 404 }
      );
    }

    const videoId = video.id.videoId;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;

    // Cache the video
    await sql`
      INSERT INTO exercise_video_cache (exercise_name, video_url, video_id, embed_url, video_title)
      VALUES (${exerciseName.toLowerCase()}, ${videoUrl}, ${videoId}, ${embedUrl}, ${video.snippet.title})
      ON CONFLICT (exercise_name) DO NOTHING
    `;

    return NextResponse.json({
      success: true,
      data: {
        videoUrl,
        embedUrl,
        videoId,
        videoTitle: video.snippet.title,
        useCount: 1,
        cached: false,
      },
    });
  } catch (error) {
    console.error('Exercise video fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercise video', details: error.message },
      { status: 500 }
    );
  }
}

// Get cache statistics
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'stats') {
      const stats = await sql`
        SELECT
          COUNT(*) as total_cached,
          SUM(use_count) as total_uses,
          AVG(use_count) as avg_uses,
          MAX(last_used_at) as last_used
        FROM exercise_video_cache
      `;

      const topUsed = await sql`
        SELECT exercise_name, use_count, video_title
        FROM exercise_video_cache
        ORDER BY use_count DESC
        LIMIT 10
      `;

      return NextResponse.json({
        success: true,
        data: {
          stats: stats[0],
          topUsed,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Video cache stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get cache stats', details: error.message },
      { status: 500 }
    );
  }
}
