# Database Management

This document explains how to manage the Fortia database schema and migrations.

## Overview

The Fortia app uses a PostgreSQL database (Neon) with a migration system to safely update the schema without losing existing data.

## Database Scripts

### Available Commands

```bash
# Check migration status
npm run db:status

# Run pending migrations (safe for production)
npm run db:migrate

# Setup database from scratch (DESTRUCTIVE - only for development)
npm run db:setup
```

## Migration System

### What is a Migration?

A migration is a script that makes changes to your database schema in a safe, repeatable way. Migrations are:

- **Idempotent**: Can be run multiple times safely
- **Tracked**: The system remembers which migrations have been executed
- **Non-destructive**: Don't drop existing data unless explicitly intended

### Migration Files

Migrations are defined in `scripts/migrate-database.js` and include:

1. **001_create_data_consent_table**: Creates the data consent table for granular user consent
2. **002_update_privacy_consent_table**: Updates privacy consent table column types
3. **003_add_missing_indexes**: Ensures all necessary indexes exist

### How Migrations Work

1. **Migrations Table**: Tracks which migrations have been executed
2. **Sequential Execution**: Migrations run in order by ID
3. **Skip Completed**: Already executed migrations are skipped
4. **Error Handling**: If a migration fails, the process stops

## When to Use Each Command

### Development Environment

```bash
# First time setup (fresh database)
npm run db:setup

# After adding new migrations
npm run db:migrate
```

### Production Environment

```bash
# Always check status first
npm run db:status

# Run migrations (safe)
npm run db:migrate
```

⚠️ **Never use `npm run db:setup` in production** - it will delete all data!

## Adding New Migrations

To add a new migration:

1. **Edit `scripts/migrate-database.js`**
2. **Add a new migration object** to the `migrations` array:

```javascript
{
  id: '004_your_migration_name',
  description: 'Description of what this migration does',
  up: async () => {
    // Your migration logic here
    // Always check if changes are needed before making them
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'your_table'
      )
    `;

    if (tableExists[0].exists) {
      console.log('✅ Table already exists, skipping...');
      return;
    }

    // Create table, add columns, etc.
    await sql`CREATE TABLE your_table (...)`;
  }
}
```

3. **Run the migration**: `npm run db:migrate`

## Migration Best Practices

### ✅ Do's

- **Check before creating**: Always check if tables/columns exist before creating them
- **Use descriptive IDs**: Migration IDs should clearly describe the change
- **Test migrations**: Test migrations on a copy of production data
- **Backup first**: Always backup production data before running migrations
- **Use transactions**: Wrap complex migrations in transactions when possible

### ❌ Don'ts

- **Don't drop tables**: Unless absolutely necessary and you have backups
- **Don't modify existing data**: Without careful consideration
- **Don't skip testing**: Always test migrations before production
- **Don't use setup script**: In production environments

## Current Schema

### Core Tables

- **users**: User profiles and preferences
- **meals**: Food and nutrition tracking
- **weights**: Weight tracking over time
- **steps**: Step count and activity data
- **activities**: Workout and exercise logging
- **api_logs**: API usage monitoring

### Consent Tables

- **privacy_consent**: General privacy policy consent
- **data_consent**: Granular data collection consent preferences

### System Tables

- **migrations**: Tracks executed migrations

## Troubleshooting

### Migration Fails

1. **Check logs**: Look for specific error messages
2. **Verify database connection**: Ensure DATABASE_URL is correct
3. **Check permissions**: Ensure database user has necessary permissions
4. **Manual fix**: If needed, manually fix the database and mark migration as complete

### Migration Status Issues

```bash
# Check current status
npm run db:status

# If migrations table is corrupted, recreate it
# (This will reset migration tracking)
```

### Data Loss Prevention

- **Always backup** before running migrations
- **Test migrations** on development data first
- **Use migrations** instead of setup script for schema changes
- **Monitor logs** during migration execution

## Environment Variables

Ensure these are set in your `.env` file:

```env
DATABASE_URL=postgresql://username:password@host:port/database
```

## Support

If you encounter issues with database migrations:

1. Check the migration logs for specific errors
2. Verify your database connection
3. Ensure you have the necessary permissions
4. Consider rolling back to a backup if data loss occurs
