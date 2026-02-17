#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { appendFileSync } from "fs";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { glob } from 'glob';

// Command line argument parsing
let args = process.argv.slice(2);

// In test mode, filter out Jest arguments
if (process.env.NODE_ENV === 'test') {
  args = args.filter(arg => !arg.startsWith('--') && !arg.includes('.test.'));
}

if (args.length === 0 && process.env.NODE_ENV !== 'test') {
  console.error("Usage: obsidian-tasks-mcp <vault-directory>");
  process.exit(1);
}

// Normalize all paths consistently
export function normalizePath(p: string): string {
  return path.normalize(p);
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Set up a single vault directory
const vaultDirectory = args.length > 0 ? 
  normalizePath(path.resolve(expandHome(args[0]))) :
  // For tests, use current directory if no args provided
  normalizePath(path.resolve(process.cwd()));

// Validate that the vault directory exists and is accessible
if (process.env.NODE_ENV !== 'test') {
  try {
    const stats = await fs.stat(vaultDirectory);
    if (!stats.isDirectory()) {
      console.error(`Error: ${args[0]} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${args[0]}:`, error);
    process.exit(1);
  }
}

// Security utilities
function validateRelativePath(relativePath: string): void {
  // Check for directory traversal attempts
  if (relativePath.includes('..')) {
    throw new Error(`Access denied - directory traversal detected in path: ${relativePath}`);
  }
  
  // Additional path validation can be added here if needed
}

async function resolvePath(relativePath: string = ''): Promise<string> {
  // Validate the relative path doesn't contain directory traversal
  validateRelativePath(relativePath);
  
  // If relativePath is empty, use vault directory directly
  const absolute = relativePath === '' 
    ? vaultDirectory 
    : path.join(vaultDirectory, relativePath);
  
  // For testing environment, we'll simplify path resolution
  if (process.env.NODE_ENV === 'test') {
    // Just return the joined path for tests
    return absolute;
  }
  
  // In production mode, handle symlinks and additional security checks
  try {
    const realPath = await fs.realpath(absolute);
    // Ensure the resolved path is still within the vault directory
    if (!normalizePath(realPath).startsWith(vaultDirectory)) {
      throw new Error("Access denied - symlink target outside vault directory");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      if (!normalizePath(realParentPath).startsWith(vaultDirectory)) {
        throw new Error("Access denied - parent directory outside vault directory");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
export const ListAllTasksArgsSchema = z.object({
  path: z.string().optional(),
});

export const QueryTasksArgsSchema = z.object({
  path: z.string().optional(),
  query: z.string(),
});

export const CompleteTaskArgsSchema = z.object({
  id: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Server setup
const server = new Server(
  {
    name: "obsidian-tasks-mcp",
    version: "0.1.4",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations

import { parseTasks, queryTasks as filterTasks, taskToString, Task, completeTask } from './TaskParser.js';

export async function findAllMarkdownFiles(startPath: string): Promise<string[]> {
  const pattern = path.join(startPath, '**/*.md');
  return glob(pattern);
}

export async function extractTasksFromFile(filePath: string): Promise<Task[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Use the parseTasks function from TaskParser
    const tasks = parseTasks(content, filePath);
    
    return tasks;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return [];
  }
}

export async function findAllTasks(directoryPath: string): Promise<Task[]> {
  const markdownFiles = await findAllMarkdownFiles(directoryPath);
  const allTasks: Task[] = [];
  
  for (const filePath of markdownFiles) {
    try {
      // Extract tasks from each file
      const tasks = await extractTasksFromFile(filePath);
      allTasks.push(...tasks);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  
  return allTasks;
}

// Apply a query to a list of tasks
export function queryTasks(tasks: Task[], queryText: string): Task[] {
  try {
    return filterTasks(tasks, queryText);
  } catch (error) {
    console.error(`Error querying tasks: ${error}`);
    // If the query fails, return an empty list
    return [];
  }
}

// Helper function to serialize tasks to JSON
export function serializeTasksToJson(tasks: Task[]): string {
  return JSON.stringify(tasks, null, 2);
}



// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_all_tasks",
        description:
          "Extract all tasks from markdown files in a directory. " +
          "Recursively scans all markdown files and extracts tasks based on the Obsidian Tasks format. " +
          "Returns structured data about each task including status, dates, and tags. " +
          "The path parameter is optional; if not specified, it defaults to the vault root directory. " +
          "The path must be relative to the vault directory and cannot contain directory traversal components (..).",
        inputSchema: zodToJsonSchema(ListAllTasksArgsSchema) as ToolInput,
      },
      {
        name: "query_tasks",
        description:
          "Search for tasks based on Obsidian Tasks query syntax. Each line is a filter with AND logic between lines. " +
          "SUPPORTED FILTERS: " +
          "Status: 'done', 'not done', 'cancelled', 'in progress' | " +
          "Due Dates: 'due today', 'due before YYYY-MM-DD', 'due after YYYY-MM-DD', 'has due date', 'no due date' | " +
          "Scheduled Dates: 'scheduled today', 'scheduled before YYYY-MM-DD', 'scheduled after YYYY-MM-DD', 'has scheduled date', 'no scheduled date' | " +
          "Start Dates: 'starts today', 'starts before YYYY-MM-DD', 'starts after YYYY-MM-DD', 'has start date', 'no start date' | " +
          "Tags: 'has tags', 'no tags', 'tag includes #tagname', 'has tag #exacttag' | " +
          "Priority: 'priority is high', 'priority is medium', 'priority is low', 'priority is none' | " +
          "Path: 'path includes text', 'path does not include text' (excludes files/folders containing text) | " +
          "Description: 'description includes text' | " +
          "Completion Date: 'description includes ✅ YYYY-MM-DD' (tasks completed on specific date) | " +
          "Urgency: 'urgency above 10', 'urgency below 5' | " +
          "BOOLEAN OPERATORS (case-sensitive): " +
          "'filter1 AND filter2' (both must match), 'filter1 OR filter2' (either matches), 'NOT filter' (negates filter) | " +
          "SUPPORTED SORTING: " +
          "'sort by urgency' (default), 'sort by urgency reverse' | " +
          "UNSUPPORTED: group by, limit, sort by due/priority, happens before, priority without 'is', lowercase and/or/not. " +
          "Always sorts by urgency unless specified otherwise.",
        inputSchema: zodToJsonSchema(QueryTasksArgsSchema) as ToolInput,
      },
      {
        name: "complete_task",
        description:
          "Mark a task as complete by changing its status from incomplete to complete. " +
          "Takes a task ID in the format 'filePath:lineNumber' (e.g., '/path/to/file.md:42'). " +
          "Updates the task status from '[ ]' to '[x]' and adds a completion timestamp '✅ YYYY-MM-DD'. " +
          "Preserves all existing task metadata including tags, dates, priority, and recurrence patterns. " +
          "The task ID can be obtained from the results of list_all_tasks or query_tasks commands.",
        inputSchema: zodToJsonSchema(CompleteTaskArgsSchema) as ToolInput,
      }
    ],
  };
});


// Exported handlers for testing
export async function handleListAllTasksRequest(args: any) {
  try {
    const parsed = ListAllTasksArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for list_all_tasks: ${parsed.error}`);
    }
    
    // Use specified path or default to vault root directory
    const relativePath = parsed.data.path || '';
    
    // Validate and resolve the path (even in test mode)
    const validPath = await resolvePath(relativePath);
    
    const tasks = await findAllTasks(validPath);
    return {
      content: [{ type: "text", text: serializeTasksToJson(tasks) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
}

export async function handleQueryTasksRequest(args: any) {
  try {
    const parsed = QueryTasksArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for query_tasks: ${parsed.error}`);
    }
    
    // File logging for debugging
    const debugLog = (msg: string) => {
      const timestamp = new Date().toISOString();
      const logMsg = `${timestamp} [DEBUG] ${msg}\n`;
      console.error(logMsg.trim()); // Still try stderr
      try {
        appendFileSync('/tmp/obsidian-mcp-debug.log', logMsg);
      } catch (e) {
        // Ignore file errors
      }
    };
    
    debugLog(`Query received: ${JSON.stringify(parsed.data.query)}`);
    
    // Use specified path or default to vault root directory
    const relativePath = parsed.data.path || '';
    
    // Validate and resolve the path (even in test mode)
    const validPath = await resolvePath(relativePath);
    debugLog(`Scanning path: ${validPath}`);
    
    // Get all tasks from the directory
    const allTasks = await findAllTasks(validPath);
    debugLog(`Found ${allTasks.length} total tasks`);
    
    // Apply the query to filter tasks
    const filteredTasks = queryTasks(allTasks, parsed.data.query);
    debugLog(`After filtering: ${filteredTasks.length} tasks`);
    
    // Debug: Check task size
    if (filteredTasks.length > 0) {
      const sampleTask = JSON.stringify(filteredTasks[0], null, 2);
      debugLog(`Sample task size: ${sampleTask.length} chars`);
      debugLog(`Average task size: ${Math.ceil(JSON.stringify(filteredTasks).length / filteredTasks.length)} chars`);
    }
    
    // Check token size and truncate if needed
    let responseText = serializeTasksToJson(filteredTasks);
    let tokenCount = Math.ceil(responseText.length / 3.5); // More accurate token estimate
    debugLog(`Response size: ${responseText.length} chars (~${tokenCount} tokens)`);
    
    // Truncate if response is too large (keep under 15k tokens to be very safe)
    if (tokenCount > 15000) {
      const maxTasks = Math.floor(filteredTasks.length * 15000 / tokenCount);
      const truncatedTasks = filteredTasks.slice(0, maxTasks);
      responseText = serializeTasksToJson(truncatedTasks);
      const newTokenCount = Math.ceil(responseText.length / 3.5);
      debugLog(`Truncated to ${truncatedTasks.length} tasks (~${newTokenCount} tokens)`);
      
      // Add truncation notice
      const truncationNotice = `--- RESPONSE TRUNCATED ---\nShowing ${truncatedTasks.length} of ${filteredTasks.length} matching tasks to stay within token limits.\nUse more specific filters to see all results.`;
      responseText = responseText.slice(0, -1) + ',' + JSON.stringify({
        id: "truncation-notice",
        description: truncationNotice,
        status: "note",
        statusSymbol: "!",
        filePath: "",
        lineNumber: 0,
        tags: [],
        urgency: 0,
        originalMarkdown: ""
      }) + ']';
    }
    
    return {
      content: [{ type: "text", text: responseText }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DEBUG] Error in handleQueryTasksRequest: ${errorMessage}`);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
}

export async function handleCompleteTaskRequest(args: any) {
  // Setup debug logging for task completion
  const debugLog = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `${timestamp} [COMPLETE_TASK] ${msg}\n`;
    console.error(logMsg.trim());
    try {
      appendFileSync('/tmp/obsidian-mcp-debug.log', logMsg);
    } catch (e) {
      // Ignore file errors
    }
  };

  try {
    debugLog(`Complete task request received with args: ${JSON.stringify(args)}`);
    
    const parsed = CompleteTaskArgsSchema.safeParse(args);
    if (!parsed.success) {
      debugLog(`Argument parsing failed: ${parsed.error}`);
      throw new Error(`Invalid arguments for complete_task: ${parsed.error}`);
    }
    
    // Extract file path from task ID to validate security
    const taskId = parsed.data.id;
    debugLog(`Processing task ID: ${taskId}`);
    
    const lastColonIndex = taskId.lastIndexOf(':');
    if (lastColonIndex === -1) {
      debugLog(`Invalid task ID format - no colon found: ${taskId}`);
      throw new Error(`Invalid task ID format: ${taskId}. Expected format: filePath:lineNumber`);
    }
    
    const filePath = taskId.substring(0, lastColonIndex);
    const lineNumber = taskId.substring(lastColonIndex + 1);
    debugLog(`Extracted file path: ${filePath}, line number: ${lineNumber}`);
    
    // Validate that the file path is within the vault directory
    // First, make it relative to vault if it's absolute
    let relativePath = filePath;
    if (path.isAbsolute(filePath)) {
      debugLog(`File path is absolute: ${filePath}`);
      if (!normalizePath(filePath).startsWith(vaultDirectory)) {
        debugLog(`Security violation - file path outside vault: ${filePath} not in ${vaultDirectory}`);
        throw new Error(`Access denied - file path outside vault directory: ${filePath}`);
      }
      relativePath = path.relative(vaultDirectory, filePath);
      debugLog(`Converted to relative path: ${relativePath}`);
    } else {
      debugLog(`File path is relative: ${filePath}`);
    }
    
    // Use existing security validation
    debugLog(`Validating path security for: ${relativePath}`);
    await resolvePath(relativePath);
    debugLog(`Path security validation passed`);
    
    // Complete the task
    debugLog(`Starting task completion process for: ${taskId}`);
    const result = await completeTask(taskId);
    
    debugLog(`Task completion result - Success: ${result.success}, Message: ${result.message}`);
    
    if (result.success) {
      debugLog(`Task completion successful, returning success response`);
      return {
        content: [{ type: "text", text: result.message }],
      };
    } else {
      debugLog(`Task completion failed, returning error response`);
      return {
        content: [{ type: "text", text: `Error: ${result.message}` }],
        isError: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog(`Exception caught in handleCompleteTaskRequest: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      debugLog(`Stack trace: ${error.stack}`);
    }
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name === "list_all_tasks") {
      return await handleListAllTasksRequest(args);
    }
    
    if (name === "query_tasks") {
      return await handleQueryTasksRequest(args);
    }
    
    if (name === "complete_task") {
      return await handleCompleteTaskRequest(args);
    }
    
    throw new Error(`Unknown tool: ${name}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Obsidian Tasks MCP Server running on stdio");
  console.error("Vault directory:", vaultDirectory);
}

// Don't run the server in test mode
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_SERVER !== 'true') {
  runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
  });
}
