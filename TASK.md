# Recurring Task Implementation Status

## Current State
**NEARLY COMPLETE** - Implementing Obsidian Tasks recurring functionality with below-placement of new tasks.

## What's Been Done ✅
1. **Pattern Classification**: Simple vs complex recurrence patterns
2. **Simple Pattern Handler**: Direct moment.js date arithmetic for basic patterns
3. **Invalid Date Handling**: Move backwards to valid date (Obsidian Tasks behavior)
4. **Hybrid Approach**: Use simple arithmetic for basic patterns, RRule for complex ones
5. **Reference Date Logic**: Fixed "when done" vs original date-based recurrence
6. **Date Relationships**: Preserve relative distances between start/scheduled/due dates
7. **Regex Fix**: Fixed recurrence parsing regex to capture full pattern
8. **Below Placement**: New recurring tasks appear below completed task

## Current Issues 🔧
1. **Strange Character**: Output shows `�` character in task description
2. **Date Calculation**: "When done" tasks still showing original date instead of next day
3. **Test Failures**: Main test still failing due to date issues

## Debug Info
- **Recurrence parsing**: NOW WORKING ✅ (`every day when done` → `rule: "every day", whenDone: true`)
- **Pattern classification**: Working ✅ (recognizes as "simple")
- **Simple pattern parsing**: Working ✅ (`{interval: 1, unit: 'days'}`)
- **Date calculation**: Issue - showing 2025-08-05 instead of 2025-08-05 (should be completion date + 1 day)

## Immediate Next Steps
1. **Debug date calculation** in `calculateNextOccurrence` - "when done" logic
2. **Fix character encoding issue** in `buildTaskMarkdown` 
3. **Test and verify** all recurrence patterns work correctly
4. **Update tests** to match corrected behavior

## Key Files Modified
- `src/TaskParser.ts`: 
  - RecurrenceUtils class with hybrid simple/complex approach
  - Fixed recurrence regex: `/🔁\s?([^📅🗓️⏳🛫➕⏫🔼🔽⏬🔺#]+?)(?=\s*[📅🗓️⏳🛫➕⏫🔼🔽⏬🔺#]|$)/`
  - Updated `calculateNextOccurrence` with proper "when done" logic
  - Updated `completeTask` to create recurring tasks below original

## Test Command
```bash
npm test -- --testNamePattern="should create a new recurring task below completed task"
```

## Current Test Output
```
Expected pattern: /^\- \[ \] Recurring task 🔁 every day when done 📅 \d{4}-\d{2}-\d{2}$/
Received string:  "- [ ] Recurring task � 🔁 every day when done 📅 2025-08-05"
```

## Architecture 
- **Simple patterns**: `every X days/weeks/months/years` → direct moment.js arithmetic
- **Complex patterns**: `every weekday`, `every month on last Friday` → RRule
- **"When done"**: Base next occurrence on completion date
- **Original date**: Base next occurrence on task's original due/scheduled/start date
- **Edge cases**: Invalid dates move backwards (Feb 31 → Feb 28)
- **Below placement**: `lines.splice(targetLineIndex + 1, 0, newTaskLine)`

## Todo Status
1. ✅ Pattern classification system
2. ✅ Simple pattern handler 
3. ✅ Invalid date handling
4. 🔧 Reference date logic (in progress - date calc issue)
5. ✅ Date relationship preservation
6. ⏳ Enhanced pattern parsing (pending)
7. ✅ Hybrid calculateNextOccurrence
8. 🔧 Fix tests (in progress)

## Success Criteria
- "When done" tasks: completion date + interval
- Original date tasks: original date + interval  
- New tasks appear below completed task
- All date relationships preserved
- All Obsidian Tasks recurrence patterns supported