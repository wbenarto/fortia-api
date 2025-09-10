# Database Cleanup Scripts

This directory contains scripts to clean up duplicate BMR entries in the database.

## 🧹 BMR Duplicate Cleanup

### **Scripts Available:**

#### 1. **SQL Scripts**
- `cleanup-bmr-duplicates-today.sql` - Clean up today's BMR duplicates only
- `cleanup-bmr-duplicates.sql` - Clean up BMR duplicates for a specific date or all dates

#### 2. **Node.js Script**
- `cleanup-bmr-duplicates.js` - Interactive cleanup script with detailed output

### **How to Run:**

#### **Option 1: Using Node.js Script (Recommended)**
```bash
# Clean up today's duplicates
node scripts/cleanup-bmr-duplicates.js

# Clean up specific date
node scripts/cleanup-bmr-duplicates.js 2024-01-15

# Clean up all duplicates (all dates)
node scripts/cleanup-bmr-duplicates.js all
```

#### **Option 2: Using SQL Scripts**
```bash
# For today only
psql "your-database-connection-string" -f scripts/cleanup-bmr-duplicates-today.sql

# For specific date (edit the script first)
psql "your-database-connection-string" -f scripts/cleanup-bmr-duplicates.sql
```

#### **Option 3: Using Neon CLI**
```bash
# For today only
neon db execute --sql-file scripts/cleanup-bmr-duplicates-today.sql

# For specific date
neon db execute --sql-file scripts/cleanup-bmr-duplicates.sql
```

### **What the Scripts Do:**

1. **Show Before State**: Display all BMR entries before cleanup
2. **Identify Duplicates**: Find user-date combinations with multiple BMR entries
3. **Delete Duplicates**: Keep only the most recent BMR entry per user per date
4. **Show After State**: Display remaining BMR entries after cleanup
5. **Provide Summary**: Show total entries, unique users, and unique dates

### **Safety Features:**

- ✅ **Non-destructive**: Only removes duplicates, keeps most recent entry
- ✅ **Detailed logging**: Shows before/after states
- ✅ **Validation**: Checks for valid date formats
- ✅ **Error handling**: Graceful error handling and reporting

### **Example Output:**
```
🧹 Starting BMR duplicate cleanup...
📅 Cleaning up BMR duplicates for today

📊 BEFORE CLEANUP:
┌─────────────┬────────────┬─────────────────────────────┬──────────────────┬─────────────────────┬───────────────┐
│ clerk_id    │ date       │ activity_description        │ estimated_calories│ created_at          │ total_entries │
├─────────────┼────────────┼─────────────────────────────┼──────────────────┼─────────────────────┼───────────────┤
│ user_123    │ 2024-01-15 │ Basal Metabolic Rate (BMR)  │ 1800             │ 2024-01-15 10:30:00 │ 2             │
│ user_123    │ 2024-01-15 │ Basal Metabolic Rate (BMR)  │ 1800             │ 2024-01-15 09:15:00 │ 2             │
└─────────────┴────────────┴─────────────────────────────┴──────────────────┴─────────────────────┴───────────────┘

🔍 Found 1 user-date combinations with duplicates:
┌─────────────┬────────────┬─────────────────┐
│ clerk_id    │ date       │ duplicate_count │
├─────────────┼────────────┼─────────────────┤
│ user_123    │ 2024-01-15 │ 2               │
└─────────────┴────────────┴─────────────────┘

🗑️  Deleted 1 duplicate BMR entries

📊 AFTER CLEANUP:
┌─────────────┬────────────┬─────────────────────────────┬──────────────────┬─────────────────────┐
│ clerk_id    │ date       │ activity_description        │ estimated_calories│ created_at          │
├─────────────┼────────────┼─────────────────────────────┼──────────────────┼─────────────────────┤
│ user_123    │ 2024-01-15 │ Basal Metabolic Rate (BMR)  │ 1800             │ 2024-01-15 10:30:00 │
└─────────────┴────────────┴─────────────────────────────┴──────────────────┴─────────────────────┘

📈 SUMMARY:
┌─────────────────────┬───────────────┬──────────────┐
│ total_bmr_entries   │ unique_users  │ unique_dates │
├─────────────────────┼───────────────┼──────────────┤
│ 1                   │ 1             │ 1            │
└─────────────────────┴───────────────┴──────────────┘

✅ BMR duplicate cleanup completed successfully!
```

### **⚠️ Important Notes:**

1. **Backup First**: Always backup your database before running cleanup scripts
2. **Test Environment**: Test scripts on a development database first
3. **Monitor Results**: Review the before/after output to ensure correct cleanup
4. **Run Regularly**: Consider running cleanup scripts regularly to prevent accumulation

### **Troubleshooting:**

- **Permission Errors**: Ensure database connection string has proper permissions
- **Date Format**: Use YYYY-MM-DD format for specific dates
- **Network Issues**: Check database connectivity and credentials
- **Script Errors**: Check Node.js version and dependencies
