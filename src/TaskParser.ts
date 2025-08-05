/**
 * TaskParser - Inspired by Obsidian Tasks but simplified for MCP
 * 
 * This file contains a simplified implementation inspired by Obsidian Tasks
 * but without the dependency complexity.
 */

import moment from 'moment';

// Interface for our task object
export interface Task {
  id: string;
  description: string;
  status: 'complete' | 'incomplete' | 'cancelled' | 'in_progress' | 'non_task';
  statusSymbol: string;
  filePath: string;
  lineNumber: number;
  tags: string[];
  dueDate?: string;
  scheduledDate?: string;
  createdDate?: string;
  startDate?: string;
  priority?: string;
  recurrence?: string;
  urgency: number;
  originalMarkdown: string;
}

// Regular expressions based on Obsidian Tasks conventions
export class TaskRegex {
  // Matches indentation before a list marker (including > for potentially nested blockquotes or Obsidian callouts)
  static readonly indentationRegex = /^([\s\t>]*)/;

  // Matches - * and + list markers, or numbered list markers, for example 1. and 1)
  static readonly listMarkerRegex = /([-*+]|[0-9]+[.)])/;

  // Matches a checkbox and saves the status character inside
  static readonly checkboxRegex = /\[(.)\]/u;

  // Matches the rest of the task after the checkbox.
  static readonly afterCheckboxRegex = / *(.*)/u;

  // Main regex for parsing a line. It matches the following:
  // - Indentation
  // - List marker
  // - Status character
  // - Rest of task after checkbox markdown
  static readonly taskRegex = new RegExp(
    TaskRegex.indentationRegex.source +
    TaskRegex.listMarkerRegex.source +
    ' +' +
    TaskRegex.checkboxRegex.source +
    TaskRegex.afterCheckboxRegex.source,
    'u',
  );
  
  // Matches hashtags in task descriptions
  static readonly hashTags = /(^|\s)#[^ !@#$%^&*(),.?":{}|<>]+/g;
  
  // Date related regular expressions - matches emoji followed by date
  static readonly dueDateRegex = /[📅🗓️]\s?(\d{4}-\d{2}-\d{2})/;
  static readonly scheduledDateRegex = /⏳\s?(\d{4}-\d{2}-\d{2})/;
  static readonly startDateRegex = /🛫\s?(\d{4}-\d{2}-\d{2})/;
  static readonly createdDateRegex = /➕\s?(\d{4}-\d{2}-\d{2})/;
  
  // Priority emoji - order is important! Longest pattern first
  static readonly priorityRegex = /(⏫⏫|⏫|🔼|🔽|⏬)/g;
  
  // Recurrence
  static readonly recurrenceRegex = /🔁\s?(.*?)(?=(\s|$))/;
}

/**
 * Calculate urgency score for a task using Obsidian Tasks formula
 * Formula: Due Date Score + Priority Score + Scheduled Date Score + Start Date Score
 */
export function calculateUrgency(task: Partial<Task>): number {
  let urgencyScore = 0;
  
  // Due Date Score (strongest influence)
  if (task.dueDate) {
    const today = moment();
    const dueDate = moment(task.dueDate);
    
    if (dueDate.isValid()) {
      const daysDiff = dueDate.diff(today, 'days');
      
      if (daysDiff <= -7) {
        // Due 7+ days ago
        urgencyScore += 12.0;
      } else if (daysDiff === -7) {
        // Due 7 days ago
        urgencyScore += 12.0;
      } else if (daysDiff === -6) {
        urgencyScore += 11.54286;
      } else if (daysDiff === -5) {
        urgencyScore += 11.08571;
      } else if (daysDiff === -4) {
        urgencyScore += 10.62857;
      } else if (daysDiff === -3) {
        urgencyScore += 10.17143;
      } else if (daysDiff === -2) {
        urgencyScore += 9.71429;
      } else if (daysDiff === -1) {
        urgencyScore += 9.25714;
      } else if (daysDiff === 0) {
        // Due today
        urgencyScore += 8.8;
      } else if (daysDiff === 1) {
        urgencyScore += 8.34286;
      } else if (daysDiff === 2) {
        urgencyScore += 7.88571;
      } else if (daysDiff === 3) {
        urgencyScore += 7.42857;
      } else if (daysDiff === 4) {
        urgencyScore += 6.97143;
      } else if (daysDiff === 5) {
        urgencyScore += 6.51429;
      } else if (daysDiff === 6) {
        urgencyScore += 6.05714;
      } else if (daysDiff === 7) {
        urgencyScore += 5.6;
      } else if (daysDiff === 8) {
        urgencyScore += 5.14286;
      } else if (daysDiff === 9) {
        urgencyScore += 4.68571;
      } else if (daysDiff === 10) {
        urgencyScore += 4.22857;
      } else if (daysDiff === 11) {
        urgencyScore += 3.77143;
      } else if (daysDiff === 12) {
        urgencyScore += 3.31429;
      } else if (daysDiff === 13) {
        urgencyScore += 2.85714;
      } else if (daysDiff === 14) {
        urgencyScore += 2.4;
      } else if (daysDiff > 14) {
        // More than 14 days until due
        urgencyScore += 2.4;
      }
    }
  }
  
  // Priority Score
  switch (task.priority) {
    case 'highest':
      urgencyScore += 9.0;
      break;
    case 'high':
      urgencyScore += 6.0;
      break;
    case 'medium':
      urgencyScore += 3.9;
      break;
    case 'low':
      urgencyScore += 0.0;
      break;
    case 'lowest':
      urgencyScore += -1.8;
      break;
    default:
      // None/undefined priority
      urgencyScore += 1.95;
      break;
  }
  
  // Scheduled Date Score
  if (task.scheduledDate) {
    const today = moment();
    const scheduledDate = moment(task.scheduledDate);
    
    if (scheduledDate.isValid()) {
      if (scheduledDate.isSameOrBefore(today, 'day')) {
        // Today or earlier
        urgencyScore += 5.0;
      } else {
        // Tomorrow or later
        urgencyScore += 0.0;
      }
    }
  }
  
  // Start Date Score
  if (task.startDate) {
    const today = moment();
    const startDate = moment(task.startDate);
    
    if (startDate.isValid()) {
      if (startDate.isSameOrBefore(today, 'day')) {
        // Today or earlier
        urgencyScore += 0.0;
      } else {
        // Tomorrow or later
        urgencyScore += -3.0;
      }
    }
  }
  
  return urgencyScore;
}

/**
 * Parse a string containing text that may have tasks and extract Task objects.
 * 
 * @param text The text to parse for tasks
 * @param filePath Optional file path for the task location
 * @returns Array of Task objects
 */
export function parseTasks(text: string, filePath: string = ''): Task[] {
  const lines = text.split('\n');
  const tasks: Task[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const task = parseTaskLine(line, filePath, i + 1); // Convert to 1-based line number
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Parse a task from a line of text
 */
export function parseTaskLine(line: string, filePath: string = '', lineNumber: number = 0): Task | null {
  const match = line.match(TaskRegex.taskRegex);
  if (!match) {
    return null;
  }
  
  const statusChar = match[3];
  const description = match[4].trim();
  
  // Extract tags
  const tags = (description.match(TaskRegex.hashTags) || [])
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
  
  // Check for dates
  const dueMatch = description.match(TaskRegex.dueDateRegex);
  const scheduledMatch = description.match(TaskRegex.scheduledDateRegex);
  const startMatch = description.match(TaskRegex.startDateRegex);
  const createdMatch = description.match(TaskRegex.createdDateRegex);
  const recurrenceMatch = description.match(TaskRegex.recurrenceRegex);
  
  // Determine priority - check for highest priority first
  let priority = undefined;
  
  // Use regex to find all priority markers in order of appearance
  const priorityMatches = description.match(/🔺|⏫⏫|⏫|🔼|🔽|⏬/g);
  
  if (priorityMatches && priorityMatches.length > 0) {
    // Use the first priority marker found
    const firstPriority = priorityMatches[0];
    
    if (firstPriority === '🔺') priority = 'highest';
    else if (firstPriority === '⏫⏫') priority = 'highest';
    else if (firstPriority === '⏫') priority = 'high';
    else if (firstPriority === '🔼') priority = 'medium';
    else if (firstPriority === '🔽') priority = 'low';
    else if (firstPriority === '⏬') priority = 'lowest';
  }
  
  // Create a unique ID
  const id = `${filePath}:${lineNumber}`;
  
  // Determine task status from the statusChar
  let status: Task['status'] = 'incomplete';
  if (['x', 'X'].includes(statusChar)) {
    status = 'complete';
  } else if (['-'].includes(statusChar)) {
    status = 'cancelled';
  } else if (['/'].includes(statusChar)) {
    status = 'in_progress';
  } else if ([' ', '>', '<'].includes(statusChar)) {
    status = 'incomplete';
  } else {
    // Any other character is treated as a non-task
    status = 'non_task';
  }
  
  const task: Task = {
    id,
    description,
    status,
    statusSymbol: statusChar,
    filePath,
    lineNumber,
    tags,
    dueDate: dueMatch ? dueMatch[1] : undefined,
    scheduledDate: scheduledMatch ? scheduledMatch[1] : undefined,
    startDate: startMatch ? startMatch[1] : undefined,
    createdDate: createdMatch ? createdMatch[1] : undefined,
    priority,
    recurrence: recurrenceMatch ? recurrenceMatch[1] : undefined,
    urgency: 0, // Will be calculated below
    originalMarkdown: line
  };
  
  // Calculate urgency score
  task.urgency = calculateUrgency(task);
  
  return task;
}

/**
 * Apply a filter function to a task
 */
export function applyFilter(task: Task, filter: string): boolean {
  const originalFilter = filter.trim();
  filter = filter.toLowerCase().trim();
  
  // Boolean combinations with AND, OR, NOT (case-sensitive)
  if (originalFilter.includes(' AND ')) {
    const parts = originalFilter.split(' AND ');
    return parts.every(part => applyFilter(task, part.trim()));
  }
  
  if (originalFilter.includes(' OR ')) {
    const parts = originalFilter.split(' OR ');
    return parts.some(part => applyFilter(task, part.trim()));
  }
  
  if (originalFilter.startsWith('NOT ')) {
    const subFilter = originalFilter.substring(4);
    return !applyFilter(task, subFilter);
  }
  
  // Status-based filters (handle specific cases first)
  if (filter === 'not done') {
    // Not done should only include tasks that are truly active (incomplete or in progress)
    return task.status === 'incomplete' || task.status === 'in_progress';
  }
  
  if (filter === 'done') {
    return task.status === 'complete';
  }
  
  // Generic not handler (after specific cases)
  if (filter.startsWith('not ')) {
    const subFilter = filter.substring(4);
    return !applyFilter(task, subFilter);
  }
  if (filter === 'cancelled') {
    return task.status === 'cancelled';
  }
  if (filter === 'in progress') {
    return task.status === 'in_progress';
  }
  
  // Due date filters
  if (filter.startsWith('due') || filter === 'has due date' || filter === 'no due date') {
    if (filter === 'due today') {
      const today = moment().format('YYYY-MM-DD');
      return task.dueDate === today;
    }
    if (filter === 'due before today') {
      const today = moment().format('YYYY-MM-DD');
      return task.dueDate !== undefined && task.dueDate < today;
    }
    if (filter === 'due after today') {
      const today = moment().format('YYYY-MM-DD');
      return task.dueDate !== undefined && task.dueDate > today;
    }
    if (filter === 'no due date') {
      return task.dueDate === undefined;
    }
    if (filter === 'has due date') {
      return task.dueDate !== undefined;
    }
    
    // Handle specific date patterns
    // Match patterns like "due 2024-02-07", "due on 2024-02-07"
    const dueDateMatch = filter.match(/^due\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})$/);
    if (dueDateMatch) {
      const targetDate = dueDateMatch[1];
      return task.dueDate === targetDate;
    }
    
    // Match patterns like "due before 2024-02-07"
    const dueBeforeMatch = filter.match(/^due\s+before\s+(\d{4}-\d{2}-\d{2})$/);
    if (dueBeforeMatch) {
      const targetDate = dueBeforeMatch[1];
      return task.dueDate !== undefined && task.dueDate < targetDate;
    }
    
    // Match patterns like "due after 2024-02-07"
    const dueAfterMatch = filter.match(/^due\s+after\s+(\d{4}-\d{2}-\d{2})$/);
    if (dueAfterMatch) {
      const targetDate = dueAfterMatch[1];
      return task.dueDate !== undefined && task.dueDate > targetDate;
    }
  }
  
  // Tag filters
  if (filter === 'no tags') {
    return !task.tags || task.tags.length === 0;
  }
  
  if (filter === 'has tags') {
    return task.tags && task.tags.length > 0;
  }
  
  if (filter.startsWith('tag includes ')) {
    const tagToFind = filter.split('tag includes ')[1].trim().replace(/^#/, '');
    return task.tags && task.tags.some(tag => tag.replace(/^#/, '').includes(tagToFind));
  }
  
  if (filter.startsWith('has tag ')) {
    const tagToFind = filter.substring(8).trim().replace(/^#/, '');
    return task.tags && task.tags.some(tag => {
      // Remove # prefix for comparison
      const normalizedTag = tag.replace(/^#/, '');
      // For exact matching, check if the tag equals the search term
      return normalizedTag === tagToFind;
    });
  }
  
  // Path/filename filters
  if (filter.startsWith('path includes')) {
    const pathToFind = filter.split('includes')[1].trim();
    return task.filePath.toLowerCase().includes(pathToFind.toLowerCase());
  }
  
  if (filter.startsWith('path does not include')) {
    const pathToExclude = filter.split('does not include')[1].trim();
    return !task.filePath.toLowerCase().includes(pathToExclude.toLowerCase());
  }
  
  // Description filters
  if (filter.startsWith('description includes')) {
    const textToFind = filter.split('includes')[1].trim();
    return task.description.toLowerCase().includes(textToFind.toLowerCase());
  }
  
  if (filter.startsWith('description does not include')) {
    const textToExclude = filter.split('does not include')[1].trim();
    return !task.description.toLowerCase().includes(textToExclude.toLowerCase());
  }
  
  // Priority filters
  if (filter.startsWith('priority is')) {
    const priority = filter.split('priority is')[1].trim();
    if (priority === 'highest') {
      return task.priority === 'highest';
    }
    if (priority === 'high') {
      return task.priority === 'high';
    }
    if (priority === 'medium') {
      return task.priority === 'medium';
    }
    if (priority === 'low') {
      return task.priority === 'low';
    }
    if (priority === 'lowest') {
      return task.priority === 'lowest';
    }
    if (priority === 'none') {
      return task.priority === undefined;
    }
  }
  
  // Urgency filters
  if (filter.startsWith('urgency above')) {
    const threshold = parseFloat(filter.split('urgency above')[1].trim());
    return !isNaN(threshold) && task.urgency > threshold;
  }
  
  if (filter.startsWith('urgency below')) {
    const threshold = parseFloat(filter.split('urgency below')[1].trim());
    return !isNaN(threshold) && task.urgency < threshold;
  }
  
  if (filter.startsWith('urgency is')) {
    const value = parseFloat(filter.split('urgency is')[1].trim());
    return !isNaN(value) && Math.abs(task.urgency - value) < 0.001; // Small tolerance for floating point comparison
  }
  
  // If no filter match, check if description contains the filter text
  return task.description.toLowerCase().includes(filter);
}

/**
 * Parse a query string into filters and sort commands
 */
export function parseQuery(queryText: string): { filters: string[], sortCommands: string[] } {
  const lines = queryText.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  
  const filters: string[] = [];
  const sortCommands: string[] = [];
  
  for (const line of lines) {
    if (line.toLowerCase().startsWith('sort by')) {
      sortCommands.push(line);
    } else {
      filters.push(line);
    }
  }
  
  return { filters, sortCommands };
}

/**
 * Apply sorting to a list of tasks
 */
export function applySorting(tasks: Task[], sortCommands: string[]): Task[] {
  if (sortCommands.length === 0) {
    // Default sorting by urgency descending
    return tasks.sort((a, b) => b.urgency - a.urgency);
  }
  
  let sortedTasks = [...tasks];
  
  // Apply sort commands in reverse order for proper precedence
  for (let i = sortCommands.length - 1; i >= 0; i--) {
    const command = sortCommands[i].toLowerCase().trim();
    
    if (command === 'sort by urgency' || command === 'sort by urgency reverse') {
      const reverse = command.includes('reverse');
      sortedTasks = sortedTasks.sort((a, b) => {
        return reverse ? a.urgency - b.urgency : b.urgency - a.urgency;
      });
    }
    // Future: Add more sort options like 'sort by due date', 'sort by priority', etc.
  }
  
  return sortedTasks;
}

/**
 * Apply a query to a list of tasks
 */
export function queryTasks(tasks: Task[], queryText: string): Task[] {
  const { filters, sortCommands } = parseQuery(queryText);
  
  // Apply all filters in sequence (AND logic between lines)
  let filteredTasks = tasks.filter(task => {
    for (const filter of filters) {
      if (!applyFilter(task, filter)) {
        return false;
      }
    }
    return true;
  });
  
  // Apply sorting
  return applySorting(filteredTasks, sortCommands);
}

/**
 * Convert a Task object back to its string representation
 * 
 * @param task Task object to convert
 * @returns String representation of the task
 */
export function taskToString(task: Task): string {
  return task.originalMarkdown;
}

/**
 * Complete a task by updating its status and adding completion date
 * 
 * @param id Task ID in format "filePath:lineNumber"
 * @returns Promise with success status and message
 */
export async function completeTask(id: string): Promise<{ success: boolean; message: string }> {
  try {
    // Parse the task ID to extract file path and line number
    const lastColonIndex = id.lastIndexOf(':');
    if (lastColonIndex === -1) {
      return { success: false, message: `Invalid task ID format: ${id}. Expected format: filePath:lineNumber` };
    }
    
    const filePath = id.substring(0, lastColonIndex);
    const lineNumberStr = id.substring(lastColonIndex + 1);
    const lineNumber = parseInt(lineNumberStr, 10);
    
    if (isNaN(lineNumber)) {
      return { success: false, message: `Invalid line number in task ID: ${lineNumberStr}` };
    }
    
    // Read the file content
    const fs = await import('fs/promises');
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return { success: false, message: `Failed to read file: ${filePath}. Error: ${error}` };
    }
    
    const lines = fileContent.split('\n');
    
    // Check if line number is valid (1-based indexing)
    if (lineNumber < 1 || lineNumber > lines.length) {
      return { success: false, message: `Line number ${lineNumber} is out of range for file with ${lines.length} lines` };
    }
    
    const targetLineIndex = lineNumber - 1; // Convert to 0-based indexing
    const originalLine = lines[targetLineIndex];
    
    // Verify this is actually a task line
    const taskMatch = originalLine.match(TaskRegex.taskRegex);
    if (!taskMatch) {
      return { success: false, message: `Line ${lineNumber} is not a valid task: ${originalLine}` };
    }
    
    const statusChar = taskMatch[3];
    
    // Check if task is already completed
    if (['x', 'X'].includes(statusChar)) {
      return { success: false, message: `Task is already completed: ${originalLine}` };
    }
    
    // Update the task status and add completion date
    const today = moment().format('YYYY-MM-DD');
    const completionEmoji = ` ✅ ${today}`;
    
    // Replace the status character with 'x' and add completion date
    let updatedLine = originalLine.replace(TaskRegex.checkboxRegex, '[x]');
    
    // Add completion date if not already present
    if (!updatedLine.includes('✅')) {
      updatedLine += completionEmoji;
    }
    
    // Update the line in the array
    lines[targetLineIndex] = updatedLine;
    
    // Write the updated content back to the file
    const updatedContent = lines.join('\n');
    try {
      await fs.writeFile(filePath, updatedContent, 'utf-8');
    } catch (error) {
      return { success: false, message: `Failed to write file: ${filePath}. Error: ${error}` };
    }
    
    return { 
      success: true, 
      message: `Task completed successfully. Updated: ${originalLine} -> ${updatedLine}` 
    };
    
  } catch (error) {
    return { 
      success: false, 
      message: `Unexpected error completing task: ${error}` 
    };
  }
}