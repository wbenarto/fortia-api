const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

// Migration functions
const migrations = [
	{
		id: '001_create_data_consent_table',
		description: 'Create data_consent table for simplified consent management',
		up: async () => {
			console.log('Running migration: Create data_consent table...');

			// Check if table already exists
			const tableExists = await sql`
				SELECT EXISTS (
					SELECT FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_name = 'data_consent'
				)
			`;

			if (tableExists[0].exists) {
				console.log('✅ data_consent table already exists, skipping...');
				return;
			}

			// Create simplified data_consent table
			await sql`
				CREATE TABLE data_consent (
					id SERIAL PRIMARY KEY,
					clerk_id VARCHAR(255) UNIQUE NOT NULL,
					data_collection_consent BOOLEAN DEFAULT FALSE,
					consent_version VARCHAR(50) DEFAULT '1.0',
					consent_method VARCHAR(100) DEFAULT 'onboarding',
					ip_address VARCHAR(45),
					user_agent TEXT,
					created_at TIMESTAMP DEFAULT NOW(),
					updated_at TIMESTAMP DEFAULT NOW()
				)
			`;

			// Create indexes
			await sql`CREATE INDEX idx_data_consent_clerk_id ON data_consent(clerk_id)`;
			await sql`CREATE INDEX idx_data_consent_created_at ON data_consent(created_at)`;

			console.log('✅ data_consent table created successfully');
		},
	},

	{
		id: '002_update_privacy_consent_table',
		description: 'Update privacy_consent table to use INET for ip_address',
		up: async () => {
			console.log('Running migration: Update privacy_consent table...');

			// Check if ip_address column exists and its type
			const columnInfo = await sql`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'privacy_consent' 
        AND column_name = 'ip_address'
      `;

			if (columnInfo.length === 0) {
				console.log("✅ ip_address column doesn't exist, skipping...");
				return;
			}

			if (columnInfo[0].data_type === 'inet') {
				console.log('✅ ip_address column already has correct type, skipping...');
				return;
			}

			// Convert TEXT to INET
			await sql`ALTER TABLE privacy_consent ALTER COLUMN ip_address TYPE INET USING ip_address::INET`;
			console.log('✅ privacy_consent.ip_address column updated to INET type');
		},
	},

	{
		id: '003_add_missing_indexes',
		description: 'Add missing indexes for better performance',
		up: async () => {
			console.log('Running migration: Add missing indexes...');

			// Check and create indexes for users table
			const userIndexes = [
				{ name: 'idx_users_clerk_id', table: 'users', column: 'clerk_id' },
				{ name: 'idx_users_email', table: 'users', column: 'email' },
				{ name: 'idx_users_created_at', table: 'users', column: 'created_at' }
			];

			for (const index of userIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			// Check and create indexes for meals table
			const mealIndexes = [
				{ name: 'idx_meals_clerk_id', table: 'meals', column: 'clerk_id' },
				{ name: 'idx_meals_created_at', table: 'meals', column: 'created_at' },
				{ name: 'idx_meals_meal_type', table: 'meals', column: 'meal_type' }
			];

			for (const index of mealIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			// Check and create indexes for weights table
			const weightIndexes = [
				{ name: 'idx_weights_clerk_id', table: 'weights', column: 'clerk_id' },
				{ name: 'idx_weights_date', table: 'weights', column: 'date' },
				{ name: 'idx_weights_clerk_date', table: 'weights', columns: ['clerk_id', 'date'] }
			];

			for (const index of weightIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					if (index.columns) {
						await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.columns.join(', '))})`;
					} else {
						await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					}
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			// Check and create indexes for steps table
			const stepIndexes = [
				{ name: 'idx_steps_clerk_id', table: 'steps', column: 'clerk_id' },
				{ name: 'idx_steps_date', table: 'steps', column: 'date' },
				{ name: 'idx_steps_clerk_date', table: 'steps', columns: ['clerk_id', 'date'] }
			];

			for (const index of stepIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					if (index.columns) {
						await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.columns.join(', '))})`;
					} else {
						await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					}
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			// Check and create indexes for activities table
			const activityIndexes = [
				{ name: 'idx_activities_clerk_id', table: 'activities', column: 'clerk_id' },
				{ name: 'idx_activities_date', table: 'activities', column: 'date' },
				{ name: 'idx_activities_created_at', table: 'activities', column: 'created_at' }
			];

			for (const index of activityIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			// Check and create indexes for api_logs table
			const apiLogIndexes = [
				{ name: 'idx_api_logs_clerk_id', table: 'api_logs', column: 'clerk_id' },
				{ name: 'idx_api_logs_created_at', table: 'api_logs', column: 'created_at' }
			];

			for (const index of apiLogIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}

			console.log('✅ All indexes checked and created successfully');
		},
	},

	{
		id: '004_add_workout_tables',
		description: 'Add workout sessions and exercises tables',
		up: async () => {
			console.log('Running migration: Add workout tables...');

			// Check if workout_sessions table exists
			const sessionsTableExists = await sql`
				SELECT EXISTS (
					SELECT FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_name = 'workout_sessions'
				)
			`;

			if (!sessionsTableExists[0].exists) {
				await sql`
					CREATE TABLE workout_sessions (
						id SERIAL PRIMARY KEY,
						clerk_id VARCHAR(255) NOT NULL,
						title TEXT NOT NULL,
						workout_type TEXT CHECK (workout_type IN ('exercise', 'barbell')),
						scheduled_date DATE NOT NULL,
						created_at TIMESTAMP DEFAULT NOW(),
						updated_at TIMESTAMP DEFAULT NOW()
					)
				`;
				console.log('✅ workout_sessions table created');
			} else {
				console.log('⏭️  workout_sessions table already exists, skipping...');
			}

			// Check if workout_exercises table exists
			const exercisesTableExists = await sql`
				SELECT EXISTS (
					SELECT FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_name = 'workout_exercises'
				)
			`;

			if (!exercisesTableExists[0].exists) {
				await sql`
					CREATE TABLE workout_exercises (
						id SERIAL PRIMARY KEY,
						workout_session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
						exercise_name TEXT NOT NULL,
						sets INTEGER,
						reps INTEGER,
						weight DECIMAL(5,2),
						duration INTEGER,
						order_index INTEGER DEFAULT 1,
						is_completed BOOLEAN DEFAULT FALSE,
						completed_at TIMESTAMP,
						calories_burned INTEGER,
						created_at TIMESTAMP DEFAULT NOW(),
						updated_at TIMESTAMP DEFAULT NOW()
					)
				`;
				console.log('✅ workout_exercises table created');
			} else {
				console.log('⏭️  workout_exercises table already exists, skipping...');
			}

			// Create indexes for workout tables
			const workoutIndexes = [
				{ name: 'idx_workout_sessions_clerk_id', table: 'workout_sessions', column: 'clerk_id' },
				{ name: 'idx_workout_sessions_date', table: 'workout_sessions', column: 'scheduled_date' },
				{ name: 'idx_workout_exercises_session_id', table: 'workout_exercises', column: 'workout_session_id' },
				{ name: 'idx_workout_exercises_order', table: 'workout_exercises', column: 'order_index' }
			];

			for (const index of workoutIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}
		},
	},

	{
		id: '005_add_deep_focus_table',
		description: 'Add deep focus sessions table',
		up: async () => {
			console.log('Running migration: Add deep focus table...');

			// Check if deep_focus_sessions table exists
			const tableExists = await sql`
				SELECT EXISTS (
					SELECT FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_name = 'deep_focus_sessions'
				)
			`;

			if (!tableExists[0].exists) {
				await sql`
					CREATE TABLE deep_focus_sessions (
						id SERIAL PRIMARY KEY,
						clerk_id VARCHAR(255) NOT NULL,
						duration_seconds INTEGER NOT NULL,
						duration_minutes DECIMAL(5,2) GENERATED ALWAYS AS (duration_seconds / 60.0) STORED,
						session_start_time TIMESTAMP,
						session_end_time TIMESTAMP,
						session_date DATE GENERATED ALWAYS AS (DATE(session_start_time)) STORED,
						is_completed BOOLEAN DEFAULT FALSE,
						created_at TIMESTAMP DEFAULT NOW(),
						updated_at TIMESTAMP DEFAULT NOW()
					)
				`;
				console.log('✅ deep_focus_sessions table created');
			} else {
				console.log('⏭️  deep_focus_sessions table already exists, skipping...');
			}

			// Create indexes for deep focus table
			const deepFocusIndexes = [
				{ name: 'idx_deep_focus_clerk_id', table: 'deep_focus_sessions', column: 'clerk_id' },
				{ name: 'idx_deep_focus_date', table: 'deep_focus_sessions', column: 'session_date' },
				{ name: 'idx_deep_focus_created_at', table: 'deep_focus_sessions', column: 'created_at' }
			];

			for (const index of deepFocusIndexes) {
				const indexExists = await sql`
					SELECT EXISTS (
						SELECT FROM pg_indexes 
						WHERE indexname = ${index.name}
					)
				`;

				if (!indexExists[0].exists) {
					await sql`CREATE INDEX ${sql.unsafe(index.name)} ON ${sql.unsafe(index.table)}(${sql.unsafe(index.column)})`;
					console.log(`✅ Created index: ${index.name}`);
				} else {
					console.log(`⏭️  Index ${index.name} already exists, skipping...`);
				}
			}
		},
	},
];

// Create migrations table
async function createMigrationsTable() {
	console.log('Creating migrations table...');

	const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'migrations'
    )
  `;

	if (!tableExists[0].exists) {
		await sql`
      CREATE TABLE migrations (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `;
		console.log('✅ migrations table created');
	} else {
		console.log('✅ migrations table already exists');
	}
}

// Get executed migrations
async function getExecutedMigrations() {
	const executed = await sql`SELECT id FROM migrations ORDER BY executed_at`;
	return executed.map(row => row.id);
}

// Mark migration as executed
async function markMigrationExecuted(migrationId, description) {
	await sql`
    INSERT INTO migrations (id, description) 
    VALUES (${migrationId}, ${description})
  `;
}

// Run migrations
async function runMigrations() {
	try {
		console.log('🚀 Starting database migrations...\n');

		// Create migrations table if it doesn't exist
		await createMigrationsTable();

		// Get already executed migrations
		const executedMigrations = await getExecutedMigrations();

		// Run pending migrations
		for (const migration of migrations) {
			if (!executedMigrations.includes(migration.id)) {
				console.log(`\n📋 Migration: ${migration.description}`);
				console.log(`🆔 ID: ${migration.id}`);

				await migration.up();
				await markMigrationExecuted(migration.id, migration.description);

				console.log(`✅ Migration ${migration.id} completed successfully\n`);
			} else {
				console.log(`⏭️  Migration ${migration.id} already executed, skipping...`);
			}
		}

		console.log('🎉 All migrations completed successfully!');
	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	}
}

// Show migration status
async function showMigrationStatus() {
	try {
		console.log('📊 Migration Status:\n');

		await createMigrationsTable();
		const executedMigrations = await getExecutedMigrations();

		console.log('Executed migrations:');
		if (executedMigrations.length === 0) {
			console.log('  None');
		} else {
			executedMigrations.forEach(id => {
				console.log(`  ✅ ${id}`);
			});
		}

		console.log('\nPending migrations:');
		const pendingMigrations = migrations.filter(m => !executedMigrations.includes(m.id));
		if (pendingMigrations.length === 0) {
			console.log('  None');
		} else {
			pendingMigrations.forEach(migration => {
				console.log(`  ⏳ ${migration.id}: ${migration.description}`);
			});
		}
	} catch (error) {
		console.error('❌ Error checking migration status:', error);
	}
}

// Main execution
const command = process.argv[2];

if (command === 'status') {
	showMigrationStatus();
} else if (command === 'migrate') {
	runMigrations();
} else {
	console.log('Usage:');
	console.log('  node scripts/migrate-database.js migrate  - Run pending migrations');
	console.log('  node scripts/migrate-database.js status   - Show migration status');
	console.log('\nExamples:');
	console.log('  node scripts/migrate-database.js migrate');
	console.log('  node scripts/migrate-database.js status');
} 