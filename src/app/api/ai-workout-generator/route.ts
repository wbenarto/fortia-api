import { fetchUserProfile } from '@/lib/userUtils';
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Call Gemini API for workout generation
async function callGeminiAPI(prompt: string) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const geminiRequestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are a professional fitness trainer. Generate a personalized workout program in JSON format only. ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequestBody),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Gemini API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response structure from Gemini API');
  }

  const responseText = data.candidates[0].content.parts[0].text.trim();

  // Try to extract JSON from the response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    throw new Error(`Failed to parse JSON: ${parseError}`);
  }
}

// Get YouTube video for exercise (with caching)
async function getYouTubeVideo(exerciseName: string) {
  // Check cache first
  const cached = await sql`
    SELECT video_url, embed_url, video_id, video_title
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
    return cached[0];
  }

  // Fetch from YouTube API
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(exerciseName + ' exercise tutorial')}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return null;
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

    return {
      video_url: videoUrl,
      embed_url: embedUrl,
      video_id: videoId,
      video_title: video.snippet.title,
    };
  } catch (error) {
    return null;
  }
}

// Calculate workout dates based on program start date and selected days
function calculateWorkoutDates(
  startDate: string,
  workoutDays: string[],
  totalWeeks: number
) {
  const dates: {
    week: number;
    dayOfWeek: string;
    date: string;
    sessionNumber: number;
  }[] = [];
  const start = new Date(startDate);

  // Map day names to numbers (0 = Sunday, 1 = Monday, etc.)
  const dayMap: { [key: string]: number } = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  const selectedDayNumbers = workoutDays.map(day => dayMap[day]).sort();

  for (let week = 1; week <= totalWeeks; week++) {
    let sessionNumber = 1;

    for (const dayName of workoutDays) {
      const dayNumber = dayMap[dayName];

      // Calculate the date for this workout
      // Find the first occurrence of this day in the week
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + (week - 1) * 7);

      // Find the specific day in this week
      const daysUntilTarget = (dayNumber - weekStart.getDay() + 7) % 7;
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(weekStart.getDate() + daysUntilTarget);

      dates.push({
        week,
        dayOfWeek: dayName,
        date: workoutDate.toISOString().split('T')[0], // YYYY-MM-DD format
        sessionNumber: sessionNumber++,
      });
    }
  }

  return dates;
}

// Create workout program in database
async function createWorkoutProgram(clerkId: string, programData: any) {
  const { programName, weeks, muscleBalance } = programData;
  const startDate = new Date().toISOString().split('T')[0]; // Today's date

  // Create program
  const [program] = await sql`
    INSERT INTO workout_programs (
      clerk_id, program_name, program_goal, total_weeks, sessions_per_week,
      session_duration, workout_days, available_equipment, muscle_balance_target, start_date
    ) VALUES (
      ${clerkId}, ${programName}, ${programData.goal}, ${programData.totalWeeks},
      ${programData.sessionsPerWeek}, ${programData.sessionDuration},
      ${programData.workoutDays}, ${programData.equipment}, ${JSON.stringify(muscleBalance)}, ${startDate}
    )
    RETURNING id
  `;

  const programId = program.id;

  // Calculate all workout dates
  const workoutDates = calculateWorkoutDates(
    startDate,
    programData.workoutDays,
    programData.totalWeeks
  );

  // Create a map to track which sessions we've processed
  const sessionMap = new Map<string, any>();

  // First, collect all sessions from AI response
  for (const week of weeks) {
    for (const session of week.sessions) {
      const key = `${week.weekNumber}-${session.dayOfWeek}`;
      sessionMap.set(key, {
        ...session,
        weekNumber: week.weekNumber,
        phase: week.phase,
      });
    }
  }

  // Create sessions with proper scheduling
  for (const workoutDate of workoutDates) {
    const sessionKey = `${workoutDate.week}-${workoutDate.dayOfWeek}`;
    const sessionData = sessionMap.get(sessionKey);

    if (!sessionData) {
      continue;
    }

    // Get warm-up video
    const warmUpVideo = await getYouTubeVideo(
      sessionData.warmUpVideoQuery || 'dynamic stretching warm up'
    );

    // Create session with calculated date
    const [sessionRecord] = await sql`
      INSERT INTO workout_sessions (
        clerk_id, title, workout_type, scheduled_date, program_id,
        week_number, session_number, phase_name, warm_up_video_url, completion_status
      ) VALUES (
        ${clerkId}, ${sessionData.sessionName}, 'ai_generated', ${workoutDate.date},
        ${programId}, ${workoutDate.week}, ${workoutDate.sessionNumber},
        ${sessionData.phase}, ${warmUpVideo?.embed_url || null}, 'scheduled'
      )
      RETURNING id
    `;

    const sessionId = sessionRecord.id;

    // Create exercises
    for (let i = 0; i < sessionData.exercises.length; i++) {
      const exercise = sessionData.exercises[i];

      // Get exercise video
      const exerciseVideo = await getYouTubeVideo(exercise.name);

      // Handle muscle groups - ensure it's always an array
      let muscleGroups = exercise.muscleGroups || [];
      if (typeof muscleGroups === 'string') {
        try {
          muscleGroups = JSON.parse(muscleGroups);
        } catch (e) {
          muscleGroups = [];
        }
      }
      if (!Array.isArray(muscleGroups)) {
        muscleGroups = [];
      }

      // Handle sets - ensure it's an integer
      let sets = exercise.sets;
      if (typeof sets === 'string') {
        // Try to extract number from strings like "3 sets" or "3-4 sets"
        const setsMatch = sets.match(/(\d+)/);
        sets = setsMatch ? parseInt(setsMatch[1]) : 3;
      }
      if (!Number.isInteger(sets) || sets < 1) {
        sets = 3; // Default fallback
      }

      // Handle reps - ensure it's an integer
      let reps = exercise.reps;
      if (typeof reps === 'string') {
        // Handle various rep formats
        if (
          reps.toLowerCase().includes('as many') ||
          reps.toLowerCase().includes('amrap')
        ) {
          reps = 12; // Default for "as many as possible"
        } else if (reps.includes('-')) {
          // Handle ranges like "8-12" - take the middle value
          const rangeMatch = reps.match(/(\d+)-(\d+)/);
          if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            reps = Math.round((min + max) / 2);
          } else {
            reps = 10;
          }
        } else {
          // Try to extract number from strings like "12 reps"
          const repsMatch = reps.match(/(\d+)/);
          reps = repsMatch ? parseInt(repsMatch[1]) : 10;
        }
      }
      if (!Number.isInteger(reps) || reps < 1) {
        reps = 10; // Default fallback
      }

      // Handle rest seconds - ensure it's an integer
      let restSeconds = exercise.restSeconds || 60;
      if (typeof restSeconds === 'string') {
        const restMatch = restSeconds.match(/(\d+)/);
        restSeconds = restMatch ? parseInt(restMatch[1]) : 60;
      }
      if (!Number.isInteger(restSeconds) || restSeconds < 0) {
        restSeconds = 60; // Default fallback
      }

      await sql`
        INSERT INTO workout_exercises (
          workout_session_id, exercise_name, sets, reps, rest_seconds,
          order_index, muscle_groups, video_url, exercise_completed
        ) VALUES (
          ${sessionId}, ${exercise.name}, ${sets}, ${reps},
          ${restSeconds}, ${i + 1}, ${muscleGroups},
          ${exerciseVideo?.embed_url || null}, false
        )
      `;
    }
  }

  return { programId, programName };
}

export async function POST(request: NextRequest) {
  try {
    const {
      clerkId,
      goal,
      frequency,
      workoutDays,
      duration,
      programWeeks,
      equipment,
    } = await request.json();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Clerk ID is required' },
        { status: 400 }
      );
    }

    // Fetch user profile for personalization
    const userProfile = await fetchUserProfile(clerkId);
    if (!userProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Single AI call to generate entire program structure
    const prompt = `Generate ${programWeeks}-week workout program:
GOAL: ${goal} (MOST IMPORTANT)
- Frequency: ${frequency} days/week on ${workoutDays.join(', ')}
- Duration: ${duration} min/session
- Equipment: ${equipment.join(', ')}
- User Profile: ${userProfile.fitness_goal}, ${userProfile.activity_level}, age ${userProfile.age}

Create progressive program optimized for ${goal}.

Return ONLY a valid JSON object with this exact structure:
{
  "programName": "string",
  "weeks": [
    {
      "weekNumber": 1,
      "phase": "string",
      "sessions": [
        {
          "dayOfWeek": "Monday",
          "sessionName": "string",
          "warmUpVideoQuery": "dynamic stretching for ${goal}",
          "exercises": [
            {
              "name": "string",
              "sets": 3,
              "reps": 12,
              "muscleGroups": ["chest", "triceps"],
              "restSeconds": 60
            }
          ]
        }
      ]
    }
  ],
  "muscleBalance": {
    "chest": 20,
    "back": 20,
    "legs": 25,
    "shoulders": 15,
    "arms": 10,
    "core": 10
  }
}

Be accurate and realistic with the values. Do not include any text before or after the JSON object. Make sure to include ALL weeks and complete the muscleBalance section.`;

    // Call Gemini API (single request for entire program)
    const programData = await callGeminiAPI(prompt);

    // Add additional data for database storage
    programData.goal = goal;
    programData.totalWeeks = programWeeks;
    programData.sessionsPerWeek = frequency;
    programData.sessionDuration = duration;
    programData.workoutDays = workoutDays;
    programData.equipment = equipment;
    programData.startDate = new Date().toISOString().split('T')[0];

    // Store in database
    const program = await createWorkoutProgram(clerkId, programData);

    // Log AI decision
    await sql`
      INSERT INTO ai_workout_decisions (
        clerk_id, program_id, decision_type, input_data, output_data, reasoning
      ) VALUES (
        ${clerkId}, ${program.programId}, 'program_generation',
        ${JSON.stringify({ goal, frequency, workoutDays, duration, programWeeks, equipment })},
        ${JSON.stringify(programData)}, 'Generated personalized workout program based on user goals and preferences'
      )
    `;

    return NextResponse.json({
      success: true,
      data: {
        programId: program.programId,
        programName: program.programName,
        weeks: programData.weeks,
        muscleBalance: programData.muscleBalance,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate workout program', details: error.message },
      { status: 500 }
    );
  }
}
