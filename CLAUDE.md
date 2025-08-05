# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for Obsidian Tasks integration with Claude AI. The server extracts and queries Obsidian-formatted tasks from markdown files, enabling AI-assisted task management. It provides three main MCP tools: `list_all_tasks`, `query_tasks`, and `complete_task`.

## Common Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript (outputs to dist/)
- `npm run watch` - Compile TypeScript in watch mode for development
- `npm run prepare` - Build the project (runs automatically on npm install)

### Testing
- `npm test` - Run the full test suite using Jest
- `NODE_ENV=test npm test` - Run tests with explicit test environment

### Running the Server
- `node dist/src/index.js /path/to/vault` - Run the compiled MCP server
- `npx @jfim/obsidian-tasks-mcp /path/to/vault` - Run via npm package

## Architecture

### Core Components

**src/index.ts** - Main MCP server entry point
- Sets up MCP server with stdio transport
- Handles command-line argument parsing for vault directories
- Implements security validation for path traversal protection
- Exports three main tool handlers: `handleListAllTasksRequest`, `handleQueryTasksRequest`, and `handleCompleteTaskRequest`
- Uses glob patterns to find markdown files recursively

**src/TaskParser.ts** - Task parsing and querying engine
- `Task` interface defines the structure for task objects with metadata (status, dates, tags, priority)
- `TaskRegex` class contains all regex patterns for parsing Obsidian Tasks format
- `parseTasks()` and `parseTaskLine()` extract tasks from markdown content
- `queryTasks()` and `applyFilter()` implement the query filtering system
- `completeTask()` marks tasks as complete by updating markdown files directly and handles recurring tasks
- `RecurrenceUtils` class provides comprehensive recurring task functionality with date calculations
- `TaskSerializer` class for proper task serialization using Obsidian Tasks approach
- Supports complex query syntax with AND/OR logic and various filter types

### Task Format Support
The parser recognizes standard Obsidian Tasks syntax:
- Status symbols: `[ ]` (incomplete), `[x]` (complete), `[-]` (cancelled), `[/]` (in progress)
- Date emojis: 📅🗓️ (due), ⏳ (scheduled), 🛫 (start), ➕ (created)
- Priority emojis: ⏫⏫ (highest), ⏫ (high), 🔼 (medium), 🔽 (low), ⏬ (lowest)
- Tags: `#tag` format
- Recurrence: 🔁 patterns

### Urgency Calculation
Implements the official Obsidian Tasks urgency formula:
- **Due Date Score**: Overdue tasks (12.0) down to future tasks (2.4+), with precise daily decrements
- **Priority Score**: Highest (9.0), High (6.0), Medium (3.9), None (1.95), Low (0.0), Lowest (-1.8)
- **Scheduled Date Score**: Today/earlier (5.0), Tomorrow/later (0.0)
- **Start Date Score**: Today/earlier (0.0), Tomorrow/later (-3.0)
- Final urgency = sum of all component scores
- Tasks without any metadata default to urgency score of 1.95

### Query System
Supports filtering by:
- Status: `done`, `not done`, `cancelled`, `in progress`
- Dates: `due today`, `due before 2024-01-01`, `has due date`, `no due date`
- Tags: `has tags`, `no tags`, `tag includes #work`, `has tag #specific`
- Path: `path includes folder`, `path does not include Silver Icing` (excludes subdirectories)
- Description: `description includes keyword`
- Priority: `priority is high`, `priority is none`
- Urgency: `urgency above 10`, `urgency below 5`, `urgency is 8.8`

### Boolean Operators
Supports case-sensitive boolean logic:
- `filter1 AND filter2` - Both conditions must match
- `filter1 OR filter2` - Either condition can match  
- `NOT filter` - Negates the filter condition
- Example: `(priority is high OR priority is medium) AND not done`

### Sorting System
Supports sorting by:
- `sort by urgency` - Sort by urgency score descending (highest first)
- `sort by urgency reverse` - Sort by urgency score ascending (lowest first)
- Default behavior: Sorts by urgency descending when no sort command specified

### Response Management
- **Automatic truncation**: Large responses are automatically truncated to stay under token limits
- **Truncation notice**: When truncated, shows count of hidden results and suggests more specific filters
- **Token estimation**: Provides accurate token count estimates in debug logs

### Security Features
- Path traversal protection prevents `..` in relative paths
- All paths resolved and validated against vault directory
- Symlink validation ensures targets stay within allowed directories

### Recurring Tasks Support
Implements comprehensive recurring task functionality based on Obsidian Tasks:
- **Pattern Classification**: Automatically classifies recurrence patterns as simple or complex
- **Simple Patterns**: Uses direct date arithmetic for patterns like `every X days/weeks/months/years`
- **Complex Patterns**: Uses RRule library for advanced patterns like `every weekday`, `every month on last Friday`
- **"When Done" Logic**: Tasks with `when done` modifier schedule next occurrence from completion date
- **Original Date Logic**: Standard recurring tasks schedule from original due/scheduled/start date
- **Date Relationship Preservation**: Maintains relative distances between start/scheduled/due dates
- **Below Placement**: New recurring task instances appear below the completed task
- **Invalid Date Handling**: Moves backwards to valid dates (e.g., Feb 31 → Feb 28)

### Task Completion with Recurrence
When completing a recurring task via `complete_task`:
1. Original task is marked complete with ✅ timestamp
2. If task has recurrence rule, calculates next occurrence
3. New task instance inserted below completed task with updated dates
4. All metadata (priority, tags, recurrence) preserved in new instance
5. Proper indentation and formatting maintained

### Testing Architecture
- Jest-based test suite with ES modules support
- Test environment uses `NODE_ENV=test` to disable server startup
- Test vault in `tests/test-vault/` with sample markdown files
- Special Jest configuration for RRule module transformation
- Separate test files for different functionality areas:
  - `task-extraction.test.ts` - File parsing
  - `task-parsing.test.ts` - Task parsing logic
  - `task-query.test.ts` - Query filtering
  - `mcp-tools.test.ts` - MCP tool handlers
  - `task-recurrence.test.ts` - Recurring task functionality

## Debugging

### Debug Logging
The MCP server writes debug logs to help troubleshoot query processing:

**File Logging**: Debug logs are written to `/tmp/obsidian-mcp-debug.log`
```bash
# Monitor debug logs in real-time
tail -f /tmp/obsidian-mcp-debug.log
```

**Log Contents**:
- Query received and parsed
- Path being scanned
- Total tasks found in directory
- Tasks remaining after filtering
- Response size and token estimates
- Truncation information when responses are too large

**Stderr Logging**: Debug information is also sent to stderr (may be captured by Claude Code/Desktop)

### MCP Inspector
For interactive debugging, use the official MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js /path/to/vault
```

This provides a visual interface to test MCP tools and see all debug output.

## Development Notes

### TypeScript Configuration
- Uses NodeNext module resolution for ESM compatibility
- Outputs to `dist/` directory with executable permissions
- Excludes any `obsidian-tasks/` directories from compilation

### Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `chrono-node`, `moment` - Date parsing and manipulation
- `glob` - File pattern matching for markdown discovery
- `minimatch` - Path pattern matching
- `rrule` - Recurrence rule parsing for complex recurring tasks
- `obsidian` - Type definitions (dev dependency)

### Project Structure
- Minimal two-file architecture: main server + task parser
- Exported functions allow direct testing without MCP protocol overhead
- Docker support available with volume mounting for vault access