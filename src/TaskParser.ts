/**
 * TaskParser - Inspired by Obsidian Tasks but simplified for MCP
 * 
 * This file contains a simplified implementation inspired by Obsidian Tasks
 * but without the dependency complexity.
 */

import moment from 'moment';
import * as rrulePkg from 'rrule';
import { appendFileSync } from 'fs';
// Workaround for rrule's ESM/CommonJS compatibility issues
const { RRule } = (rrulePkg as any).default || rrulePkg;
type RRuleType = InstanceType<typeof RRule>;

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
  
  // Recurrence - capture everything after 🔁 until we hit another emoji or end of line
  static readonly recurrenceRegex = /🔁\s?([^📅🗓️⏳🛫➕⏫🔼🔽⏬🔺#]+?)(?=\s*[📅🗓️⏳🛫➕⏫🔼🔽⏬🔺#]|$)/;
}

/**
 * Task serialization utilities based on Obsidian Tasks approach
 * Implements right-to-left parsing and Unicode-safe emoji handling
 */
export class TaskSerializer {
  // Field regexes based on Obsidian Tasks approach with Unicode support
  // All regexes include optional Variant Selector 16 (\uFE0F) and use 'u' flag
  private static readonly priorityRegex = /([🔺⏫🔼🔽⏬])\uFE0F?$/u;
  private static readonly dueDateRegex = /[📅📆🗓]\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/u;
  private static readonly scheduledDateRegex = /[⏳⌛]\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/u;
  private static readonly startDateRegex = /🛫\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/u;
  private static readonly doneDateRegex = /✅\uFE0F?\s*(\d{4}-\d{2}-\d{2})$/u;
  private static readonly recurrenceRegex = /🔁\uFE0F?\s*([a-zA-Z0-9, !]+)$/u;
  private static readonly hashTagRegex = /(^|\s)#[^ !@#$%^&*(),.?":{}|<>]+$/u;

  /**
   * Extract clean description by parsing metadata from the end (Obsidian Tasks approach)
   * Uses right-to-left parsing to remove metadata while preserving clean description
   */
  static extractCleanDescription(fullDescription: string): string {
    let cleanDescription = fullDescription;
    let matched = true;
    const maxRuns = 20;
    let runs = 0;
    let trailingTags = '';

    while (matched && runs < maxRuns) {
      matched = false;

      // Remove hash tags from end (handle specially like Obsidian Tasks)
      const tagsMatch = cleanDescription.match(this.hashTagRegex);
      if (tagsMatch !== null) {
        cleanDescription = cleanDescription.replace(this.hashTagRegex, '').trim();
        matched = true;
        const tagName = tagsMatch[0].trim();
        // Adding to the left because matching is done right-to-left
        trailingTags = trailingTags.length > 0 ? [tagName, trailingTags].join(' ') : tagName;
      }

      // Remove priority from end
      const priorityMatch = cleanDescription.match(this.priorityRegex);
      if (priorityMatch !== null) {
        cleanDescription = cleanDescription.replace(this.priorityRegex, '').trim();
        matched = true;
      }

      // Remove completion date from end
      const doneDateMatch = cleanDescription.match(this.doneDateRegex);
      if (doneDateMatch !== null) {
        cleanDescription = cleanDescription.replace(this.doneDateRegex, '').trim();
        matched = true;
      }

      // Remove due date from end
      const dueDateMatch = cleanDescription.match(this.dueDateRegex);
      if (dueDateMatch !== null) {
        cleanDescription = cleanDescription.replace(this.dueDateRegex, '').trim();
        matched = true;
      }

      // Remove scheduled date from end
      const scheduledDateMatch = cleanDescription.match(this.scheduledDateRegex);
      if (scheduledDateMatch !== null) {
        cleanDescription = cleanDescription.replace(this.scheduledDateRegex, '').trim();
        matched = true;
      }

      // Remove start date from end
      const startDateMatch = cleanDescription.match(this.startDateRegex);
      if (startDateMatch !== null) {
        cleanDescription = cleanDescription.replace(this.startDateRegex, '').trim();
        matched = true;
      }

      // Remove recurrence from end
      const recurrenceMatch = cleanDescription.match(this.recurrenceRegex);
      if (recurrenceMatch !== null) {
        cleanDescription = cleanDescription.replace(this.recurrenceRegex, '').trim();
        matched = true;
      }

      runs++;
    }

    // Add back any trailing tags to the description (like Obsidian Tasks does)
    if (trailingTags.length > 0) {
      cleanDescription += ' ' + trailingTags;
    }

    return cleanDescription;
  }

  /**
   * Serialize task to markdown string (Obsidian Tasks component-based approach)
   * Components are added in the order specified by Obsidian Tasks TaskLayoutComponent enum
   */
  static serialize(task: Task): string {
    // Start with clean description
    const cleanDescription = this.extractCleanDescription(task.description);
    let result = cleanDescription;

    // Follow Obsidian Tasks component order:
    // 1. Description (already added)
    // 2. Priority 
    if (task.priority) {
      const priorityEmoji = {
        highest: '🔺',
        high: '⏫', 
        medium: '🔼',
        low: '🔽',
        lowest: '⏬'
      }[task.priority];
      
      if (priorityEmoji) {
        result += ` ${priorityEmoji}`;
      }
    }

    // 3. Recurrence Rule
    if (task.recurrence) {
      result += ` 🔁 ${task.recurrence}`;
    }

    // 4. Start Date
    if (task.startDate) {
      result += ` 🛫 ${task.startDate}`;
    }

    // 5. Scheduled Date  
    if (task.scheduledDate) {
      result += ` ⏳ ${task.scheduledDate}`;
    }

    // 6. Due Date
    if (task.dueDate) {
      result += ` 📅 ${task.dueDate}`;
    }

    return result;
  }

  /**
   * Build complete task markdown line including checkbox
   */
  static buildTaskLine(task: Task): string {
    const taskContent = this.serialize(task);
    return `- [${task.statusSymbol}] ${taskContent}`;
  }
}

/**
 * Utilities for parsing and handling recurring tasks
 */
export class RecurrenceUtils {
  /**
   * Parse a recurrence rule string and extract components
   */
  static parseRecurrenceRule(rule: string): { rule: string; whenDone: boolean } {
    const trimmed = rule.trim();
    const whenDone = trimmed.toLowerCase().endsWith(' when done');
    const cleanRule = whenDone ? trimmed.replace(/ when done$/i, '').trim() : trimmed;
    
    return {
      rule: cleanRule,
      whenDone
    };
  }

  /**
   * Classify recurrence pattern as simple or complex
   */
  static classifyPattern(rule: string): 'simple' | 'complex' {
    const lowerRule = rule.toLowerCase();
    
    // Simple patterns that can use direct date arithmetic
    const simplePatterns = [
      /^every \d+ days?$/,           // every X days
      /^every day$/,                 // every day
      /^every \d+ weeks?$/,          // every X weeks  
      /^every week$/,                // every week
      /^every \d+ months?$/,         // every X months
      /^every month$/,               // every month
      /^every \d+ years?$/,          // every X years
      /^every year$/                 // every year
    ];
    
    for (const pattern of simplePatterns) {
      if (pattern.test(lowerRule)) {
        return 'simple';
      }
    }
    
    return 'complex';
  }

  /**
   * Parse simple recurrence pattern and return interval information
   */
  static parseSimplePattern(rule: string): { interval: number; unit: 'days' | 'weeks' | 'months' | 'years' } | null {
    const lowerRule = rule.toLowerCase();
    
    // Match patterns like "every 3 days", "every day", "every week", etc.
    const match = lowerRule.match(/^every (?:(\d+) )?(days?|weeks?|months?|years?|day|week|month|year)$/);
    
    if (!match) return null;
    
    const interval = match[1] ? parseInt(match[1]) : 1;
    let unit: 'days' | 'weeks' | 'months' | 'years';
    
    switch (match[2]) {
      case 'day':
      case 'days':
        unit = 'days';
        break;
      case 'week':
      case 'weeks':
        unit = 'weeks';
        break;
      case 'month':
      case 'months':
        unit = 'months';
        break;
      case 'year':
      case 'years':
        unit = 'years';
        break;
      default:
        return null;
    }
    
    return { interval, unit };
  }

  /**
   * Calculate next occurrence using simple date arithmetic
   * This mimics RRule.after() behavior: find the next occurrence AFTER the reference date
   */
  static calculateSimpleNextOccurrence(pattern: { interval: number; unit: 'days' | 'weeks' | 'months' | 'years' }, referenceDate: Date): Date {
    const nextDate = moment(referenceDate);
    
    // Add the interval to get the next occurrence
    // This simulates what RRule.after() would do
    switch (pattern.unit) {
      case 'days':
        nextDate.add(pattern.interval, 'days');
        break;
      case 'weeks':
        nextDate.add(pattern.interval, 'weeks');
        break;
      case 'months':
        nextDate.add(pattern.interval, 'months');
        break;
      case 'years':
        nextDate.add(pattern.interval, 'years');
        break;
    }
    
    return RecurrenceUtils.ensureValidDate(nextDate.toDate());
  }

  /**
   * Ensure date is valid, moving backwards if necessary (Obsidian Tasks behavior)
   */
  static ensureValidDate(date: Date): Date {
    const momentDate = moment(date);
    
    // If date is valid, return as-is
    if (momentDate.isValid() && momentDate.date() <= momentDate.daysInMonth()) {
      return date;
    }
    
    // Move backwards to find valid date
    const year = momentDate.year();
    const month = momentDate.month();
    let day = momentDate.date();
    
    // Keep reducing day until we find a valid date
    while (day > 0) {
      const testDate = moment({ year, month, date: day });
      if (testDate.isValid() && testDate.date() === day) {
        return testDate.toDate();
      }
      day--;
    }
    
    // Fallback (shouldn't happen)
    return moment({ year, month, date: 1 }).toDate();
  }

  /**
   * Convert Obsidian Tasks recurrence rule to RRule
   */
  static obsidianToRRule(rule: string, referenceDate: Date): RRuleType | null {
    const debugLog = (msg: string) => {
      const timestamp = new Date().toISOString();
      const logMsg = `${timestamp} [RECURRENCE_CALC] ${msg}\n`;
      console.error(logMsg.trim());
      try {
        appendFileSync('/tmp/obsidian-mcp-debug.log', logMsg);
      } catch (e) {
        // Ignore file errors
      }
    };
    
    try {
      const lowerRule = rule.toLowerCase();
      debugLog(`obsidianToRRule - RRule object: ${typeof RRule}, RRule available: ${RRule !== undefined}`);
      debugLog(`obsidianToRRule - RRule.SU available: ${RRule && RRule.SU !== undefined}`);
      
      // Handle basic patterns
      if (lowerRule.startsWith('every ')) {
        const pattern = lowerRule.substring(6); // Remove 'every '
        debugLog(`Extracted pattern after removing 'every ': "${pattern}"`);
        
        // Daily patterns
        if (pattern === 'day') {
          return new RRule({
            freq: RRule.DAILY,
            dtstart: referenceDate
          });
        }
        
        if (pattern.match(/^\d+ days?$/)) {
          const interval = parseInt(pattern.match(/^\d+/)?.[0] || '1');
          return new RRule({
            freq: RRule.DAILY,
            interval,
            dtstart: referenceDate
          });
        }
        
        // Weekly patterns
        if (pattern === 'week') {
          return new RRule({
            freq: RRule.WEEKLY,
            dtstart: referenceDate
          });
        }
        
        if (pattern === 'weekday') {
          return new RRule({
            freq: RRule.WEEKLY,
            byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
            dtstart: referenceDate
          });
        }
        
        if (pattern.match(/^\d+ weeks?$/)) {
          const interval = parseInt(pattern.match(/^\d+/)?.[0] || '1');
          return new RRule({
            freq: RRule.WEEKLY,
            interval,
            dtstart: referenceDate
          });
        }
        
        // Weekly with specific days (handles "week on Tuesday, Friday" and "X weeks on Friday")
        if (pattern.includes(' on ') && (pattern.includes('week') || pattern.includes('weeks'))) {
          let weekdays: any[] = [];
          let interval = 1;
          
          debugLog(`Checking weekly pattern with specific days: "${pattern}"`);
          
          // Inline weekday parsing helper (RRule is now properly imported)
          const parseWeekdaysInline = (dayString: string): any[] => {
            const dayMap: { [key: string]: any } = {
              sunday: RRule.SU,
              monday: RRule.MO,
              tuesday: RRule.TU,
              wednesday: RRule.WE,
              thursday: RRule.TH,
              friday: RRule.FR,
              saturday: RRule.SA
            };
            
            const days = dayString.toLowerCase().split(',').map(d => d.trim());
            const result: any[] = [];
            
            for (const day of days) {
              if (dayMap[day]) {
                result.push(dayMap[day]);
              }
            }
            
            return result;
          };

          // Handle "X weeks on day" pattern
          const weeksOnMatch = pattern.match(/^(\d+) weeks? on (.+)$/);
          if (weeksOnMatch) {
            interval = parseInt(weeksOnMatch[1]);
            weekdays = parseWeekdaysInline(weeksOnMatch[2]);
            debugLog(`Matched "X weeks on day" pattern: interval=${interval}, days="${weeksOnMatch[2]}"`);
          } else if (pattern.startsWith('week on ')) {
            // Handle "week on day(s)" pattern
            const daysPart = pattern.substring(8); // Remove 'week on '
            weekdays = parseWeekdaysInline(daysPart);
            debugLog(`Matched "week on days" pattern: days="${daysPart}"`);
          }
          
          debugLog(`Parsed weekdays: ${weekdays.length} found`);
          if (weekdays.length > 0) {
            debugLog(`Creating RRule with WEEKLY freq, interval=${interval}, byweekday=${weekdays.length} days`);
            return new RRule({
              freq: RRule.WEEKLY,
              interval,
              byweekday: weekdays,
              dtstart: referenceDate
            });
          }
        }
        
        // Monthly patterns
        if (pattern === 'month') {
          return new RRule({
            freq: RRule.MONTHLY,
            dtstart: referenceDate
          });
        }
        
        if (pattern.match(/^\d+ months?$/)) {
          const interval = parseInt(pattern.match(/^\d+/)?.[0] || '1');
          return new RRule({
            freq: RRule.MONTHLY,
            interval,
            dtstart: referenceDate
          });
        }
        
        if (pattern === 'month on the last') {
          return new RRule({
            freq: RRule.MONTHLY,
            bymonthday: [-1],
            dtstart: referenceDate
          });
        }
        
        if (pattern.match(/^month on the \d+(?:st|nd|rd|th)$/)) {
          const dayMatch = pattern.match(/\d+/);
          if (dayMatch) {
            const day = parseInt(dayMatch[0]);
            return new RRule({
              freq: RRule.MONTHLY,
              bymonthday: [day],
              dtstart: referenceDate
            });
          }
        }
        
        // Handle "month on the last [weekday]" patterns
        if (pattern.match(/^month on the last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)) {
          const weekdayMatch = pattern.match(/last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
          if (weekdayMatch) {
            const dayMap: { [key: string]: any } = {
              sunday: RRule.SU,
              monday: RRule.MO,
              tuesday: RRule.TU,
              wednesday: RRule.WE,
              thursday: RRule.TH,
              friday: RRule.FR,
              saturday: RRule.SA
            };
            const weekday = dayMap[weekdayMatch[1]];
            debugLog(`Parsed "last ${weekdayMatch[1]}" monthly pattern`);
            return new RRule({
              freq: RRule.MONTHLY,
              byweekday: [weekday.nth(-1)], // Last occurrence of weekday in month
              dtstart: referenceDate
            });
          }
        }
        
        // Handle "month on the 2nd last [weekday]" patterns  
        if (pattern.match(/^month on the 2nd last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)) {
          const weekdayMatch = pattern.match(/2nd last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
          if (weekdayMatch) {
            const dayMap: { [key: string]: any } = {
              sunday: RRule.SU,
              monday: RRule.MO,
              tuesday: RRule.TU,
              wednesday: RRule.WE,
              thursday: RRule.TH,
              friday: RRule.FR,
              saturday: RRule.SA
            };
            const weekday = dayMap[weekdayMatch[1]];
            debugLog(`Parsed "2nd last ${weekdayMatch[1]}" monthly pattern`);
            return new RRule({
              freq: RRule.MONTHLY,
              byweekday: [weekday.nth(-2)], // 2nd to last occurrence of weekday in month
              dtstart: referenceDate
            });
          }
        }
        
        // Yearly patterns
        if (pattern === 'year') {
          return new RRule({
            freq: RRule.YEARLY,
            dtstart: referenceDate
          });
        }
        
        // Monthly with specific months
        const monthMatch = pattern.match(/^(january|february|march|april|may|june|july|august|september|october|november|december) on the (\d+)(?:st|nd|rd|th)?$/);
        if (monthMatch) {
          const monthMap: { [key: string]: number } = {
            january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
            july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
          };
          const month = monthMap[monthMatch[1]];
          const day = parseInt(monthMatch[2]);
          
          return new RRule({
            freq: RRule.YEARLY,
            bymonth: [month],
            bymonthday: [day],
            dtstart: referenceDate
          });
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing recurrence rule:', error);
      return null;
    }
  }

  /**
   * Parse weekday names to RRule weekday constants
   */
  private static parseWeekdays(dayString: string): any[] {
    console.log('parseWeekdays called with:', dayString);
    console.log('RRule object:', typeof RRule, RRule);
    console.log('RRule.SU:', RRule.SU);
    
    const dayMap: { [key: string]: any } = {
      sunday: RRule.SU,
      monday: RRule.MO,
      tuesday: RRule.TU,
      wednesday: RRule.WE,
      thursday: RRule.TH,
      friday: RRule.FR,
      saturday: RRule.SA
    };
    
    const days = dayString.toLowerCase().split(',').map(d => d.trim());
    const weekdays: any[] = [];
    
    for (const day of days) {
      if (dayMap[day]) {
        weekdays.push(dayMap[day]);
      }
    }
    
    return weekdays;
  }

  /**
   * Get the reference date from a task (priority: Due > Scheduled > Start)
   */
  static getReferenceDate(task: Task): Date | null {
    if (task.dueDate) {
      const date = moment(task.dueDate);
      if (date.isValid()) return date.toDate();
    }
    
    if (task.scheduledDate) {
      const date = moment(task.scheduledDate);
      if (date.isValid()) return date.toDate();
    }
    
    if (task.startDate) {
      const date = moment(task.startDate);
      if (date.isValid()) return date.toDate();
    }
    
    return null;
  }

  /**
   * Calculate the next occurrence of a recurring task
   */
  static calculateNextOccurrence(task: Task, completionDate?: Date): Task | null {
    // Setup debug logging for recurrence calculation
    const debugLog = (msg: string) => {
      const timestamp = new Date().toISOString();
      const logMsg = `${timestamp} [RECURRENCE_CALC] ${msg}\n`;
      console.error(logMsg.trim());
      try {
        appendFileSync('/tmp/obsidian-mcp-debug.log', logMsg);
      } catch (e) {
        // Ignore file errors
      }
    };

    debugLog(`Starting calculateNextOccurrence for task: "${task.description}"`);
    debugLog(`Task recurrence rule: "${task.recurrence || 'none'}"`);
    debugLog(`Completion date provided: ${completionDate ? completionDate.toISOString() : 'none'}`);
    
    if (!task.recurrence) {
      debugLog(`No recurrence rule found, returning null`);
      return null;
    }
    
    const { rule, whenDone } = RecurrenceUtils.parseRecurrenceRule(task.recurrence);
    debugLog(`Parsed recurrence rule - Rule: "${rule}", When done: ${whenDone}`);
    
    // Determine reference date based on "when done" flag
    let referenceDate: Date;
    if (whenDone && completionDate) {
      referenceDate = completionDate;
      debugLog(`Using completion date as reference (when done): ${referenceDate.toISOString()}`);
    } else {
      const taskReferenceDate = RecurrenceUtils.getReferenceDate(task);
      if (!taskReferenceDate) {
        debugLog(`No reference date found in task, returning null`);
        return null;
      }
      referenceDate = taskReferenceDate;
      debugLog(`Using task reference date: ${referenceDate.toISOString()}`);
    }
    
    // Classify pattern and calculate next occurrence
    let nextDate: Date;
    const patternType = RecurrenceUtils.classifyPattern(rule);
    debugLog(`Pattern classified as: ${patternType}`);
    
    if (patternType === 'simple') {
      const simplePattern = RecurrenceUtils.parseSimplePattern(rule);
      if (!simplePattern) {
        debugLog(`Failed to parse simple pattern: "${rule}"`);
        return null;
      }
      debugLog(`Simple pattern parsed - Interval: ${simplePattern.interval}, Unit: ${simplePattern.unit}`);
      nextDate = RecurrenceUtils.calculateSimpleNextOccurrence(simplePattern, referenceDate);
      debugLog(`Simple calculation result: ${nextDate.toISOString()}`);
    } else {
      debugLog(`Using RRule for complex pattern: "${rule}"`);
      // Use RRule for complex patterns
      const rrule = RecurrenceUtils.obsidianToRRule(rule, referenceDate);
      if (!rrule) {
        debugLog(`Failed to convert to RRule: "${rule}"`);
        return null;
      }
      debugLog(`RRule created successfully: ${rrule.toString()}`);
      
      const rruleNext = rrule.after(referenceDate);
      if (!rruleNext) {
        debugLog(`RRule.after() returned null - no next occurrence found`);
        return null;
      }
      nextDate = rruleNext;
      debugLog(`RRule calculation result: ${nextDate.toISOString()}`);
    }
    
    debugLog(`Creating new task with base properties from original task`);
    
    // Create new task with updated dates
    const newTask: Task = {
      ...task,
      id: `${task.filePath}:${task.lineNumber + 1}`, // Will be updated when inserted
      status: 'incomplete',
      statusSymbol: ' ',
      originalMarkdown: '' // Will be built below
    };
    
    debugLog(`Base new task created with ID: ${newTask.id}`);
    
    // Update dates based on recurrence logic
    if (whenDone && completionDate) {
      debugLog(`Processing "when done" recurrence logic`);
      // For "when done" tasks, nextDate is already completion date + interval
      // Set nextDate as the primary date and maintain relative relationships
      const primaryDateField = RecurrenceUtils.getPrimaryDateField(task);
      debugLog(`Primary date field for task: ${primaryDateField || 'none'}`);
      
      if (primaryDateField === 'dueDate') {
        debugLog(`Setting due date as primary field for "when done" task`);
        const nextDateMoment = moment.utc(nextDate);
        newTask.dueDate = nextDateMoment.format('YYYY-MM-DD');
        debugLog(`New due date set to: ${newTask.dueDate}`);
        
        // Maintain relative relationships if other dates exist
        if (task.scheduledDate && task.dueDate) {
          const scheduledOffset = moment(task.scheduledDate).diff(moment(task.dueDate), 'days');
          debugLog(`Scheduled date offset from due date: ${scheduledOffset} days`);
          const newScheduled = moment(nextDate).add(scheduledOffset, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
          debugLog(`New scheduled date calculated: ${newTask.scheduledDate}`);
        }
        
        if (task.startDate && task.dueDate) {
          const startOffset = moment(task.startDate).diff(moment(task.dueDate), 'days');
          debugLog(`Start date offset from due date: ${startOffset} days`);
          const newStart = moment(nextDate).add(startOffset, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
          debugLog(`New start date calculated: ${newTask.startDate}`);
        }
      } else if (primaryDateField === 'scheduledDate') {
        debugLog(`Setting scheduled date as primary field for "when done" task`);
        newTask.scheduledDate = moment(nextDate).format('YYYY-MM-DD');
        debugLog(`New scheduled date set to: ${newTask.scheduledDate}`);
        
        if (task.dueDate && task.scheduledDate) {
          const dueOffset = moment(task.dueDate).diff(moment(task.scheduledDate), 'days');
          debugLog(`Due date offset from scheduled date: ${dueOffset} days`);
          const newDue = moment(nextDate).add(dueOffset, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
          debugLog(`New due date calculated: ${newTask.dueDate}`);
        }
        
        if (task.startDate && task.scheduledDate) {
          const startOffset = moment(task.startDate).diff(moment(task.scheduledDate), 'days');
          debugLog(`Start date offset from scheduled date: ${startOffset} days`);
          const newStart = moment(nextDate).add(startOffset, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
          debugLog(`New start date calculated: ${newTask.startDate}`);
        }
      } else if (primaryDateField === 'startDate') {
        debugLog(`Setting start date as primary field for "when done" task`);
        newTask.startDate = moment(nextDate).format('YYYY-MM-DD');
        debugLog(`New start date set to: ${newTask.startDate}`);
        
        if (task.dueDate && task.startDate) {
          const dueOffset = moment(task.dueDate).diff(moment(task.startDate), 'days');
          debugLog(`Due date offset from start date: ${dueOffset} days`);
          const newDue = moment(nextDate).add(dueOffset, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
          debugLog(`New due date calculated: ${newTask.dueDate}`);
        }
        
        if (task.scheduledDate && task.startDate) {
          const scheduledOffset = moment(task.scheduledDate).diff(moment(task.startDate), 'days');
          debugLog(`Scheduled date offset from start date: ${scheduledOffset} days`);
          const newScheduled = moment(nextDate).add(scheduledOffset, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
          debugLog(`New scheduled date calculated: ${newTask.scheduledDate}`);
        }
      } else {
        debugLog(`No primary date field found, defaulting to due date`);
        // No primary date field, default to due date
        newTask.dueDate = moment(nextDate).format('YYYY-MM-DD');
        debugLog(`Default due date set to: ${newTask.dueDate}`);
      }
    } else {
      debugLog(`Processing original date-based recurrence logic`);
      // For original date-based recurrence, calculate offset from original primary date
      const primaryDateField = RecurrenceUtils.getPrimaryDateField(task);
      const originalPrimaryDate = RecurrenceUtils.getDateFromTask(task, primaryDateField);
      debugLog(`Primary date field: ${primaryDateField || 'none'}, Original primary date: ${originalPrimaryDate ? originalPrimaryDate.toISOString() : 'none'}`);
      
      if (originalPrimaryDate) {
        const daysDiff = moment(nextDate).diff(moment(originalPrimaryDate), 'days');
        debugLog(`Days difference between next date and original primary date: ${daysDiff} days`);
        
        // Update all dates maintaining their relative relationships
        if (task.dueDate) {
          const originalDue = moment(task.dueDate);
          const newDue = originalDue.clone().add(daysDiff, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
          debugLog(`Updated due date: ${task.dueDate} -> ${newTask.dueDate} (${daysDiff} days offset)`);
        }
        
        if (task.scheduledDate) {
          const originalScheduled = moment(task.scheduledDate);
          const newScheduled = originalScheduled.clone().add(daysDiff, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
          debugLog(`Updated scheduled date: ${task.scheduledDate} -> ${newTask.scheduledDate} (${daysDiff} days offset)`);
        }
        
        if (task.startDate) {
          const originalStart = moment(task.startDate);
          const newStart = originalStart.clone().add(daysDiff, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
          debugLog(`Updated start date: ${task.startDate} -> ${newTask.startDate} (${daysDiff} days offset)`);
        }
      } else {
        debugLog(`No primary date found, setting next occurrence directly as due date`);
        // If no primary date, set the next occurrence directly as due date
        newTask.dueDate = moment(nextDate).format('YYYY-MM-DD');
        debugLog(`Set due date to: ${newTask.dueDate}`);
      }
    }
    
    debugLog(`Removing completion date from new task`);
    // Remove completion date from new task
    newTask.createdDate = undefined;
    
    debugLog(`Recalculating urgency for new task`);
    // Recalculate urgency for the new task
    newTask.urgency = calculateUrgency(newTask);
    debugLog(`New task urgency calculated: ${newTask.urgency}`);
    
    debugLog(`Building task markdown for new task`);
    // Build the new task markdown
    newTask.originalMarkdown = RecurrenceUtils.buildTaskMarkdown(newTask);
    debugLog(`New task markdown built: "${newTask.originalMarkdown}"`);
    
    debugLog(`Returning completed new task for next occurrence`);
    return newTask;
  }

  /**
   * Get the primary date field for a task (priority: due > scheduled > start)
   */
  static getPrimaryDateField(task: Task): 'dueDate' | 'scheduledDate' | 'startDate' | null {
    if (task.dueDate) return 'dueDate';
    if (task.scheduledDate) return 'scheduledDate';
    if (task.startDate) return 'startDate';
    return null;
  }

  /**
   * Get date value from task by field name
   */
  static getDateFromTask(task: Task, field: 'dueDate' | 'scheduledDate' | 'startDate' | null): Date | null {
    if (!field) return null;
    const dateStr = task[field];
    if (!dateStr) return null;
    const date = moment(dateStr);
    return date.isValid() ? date.toDate() : null;
  }

  /**
   * Build task markdown from task object using Obsidian Tasks approach
   */
  static buildTaskMarkdown(task: Task): string {
    // Use the TaskSerializer to properly serialize the task
    const taskContent = TaskSerializer.serialize(task);
    return `- [${task.statusSymbol}] ${taskContent}`;
  }
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

  // Scheduled date filters
  if (filter.startsWith('scheduled') || filter === 'has scheduled date' || filter === 'no scheduled date') {
    if (filter === 'scheduled today') {
      const today = moment().format('YYYY-MM-DD');
      return task.scheduledDate === today;
    }
    if (filter === 'scheduled before today') {
      const today = moment().format('YYYY-MM-DD');
      return task.scheduledDate !== undefined && task.scheduledDate < today;
    }
    if (filter === 'scheduled after today') {
      const today = moment().format('YYYY-MM-DD');
      return task.scheduledDate !== undefined && task.scheduledDate > today;
    }
    if (filter === 'no scheduled date') {
      return task.scheduledDate === undefined;
    }
    if (filter === 'has scheduled date') {
      return task.scheduledDate !== undefined;
    }

    // Handle specific date patterns
    // Match patterns like "scheduled 2024-02-07", "scheduled on 2024-02-07"
    const scheduledDateMatch = filter.match(/^scheduled\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})$/);
    if (scheduledDateMatch) {
      const targetDate = scheduledDateMatch[1];
      return task.scheduledDate === targetDate;
    }

    // Match patterns like "scheduled before 2024-02-07"
    const scheduledBeforeMatch = filter.match(/^scheduled\s+before\s+(\d{4}-\d{2}-\d{2})$/);
    if (scheduledBeforeMatch) {
      const targetDate = scheduledBeforeMatch[1];
      return task.scheduledDate !== undefined && task.scheduledDate < targetDate;
    }

    // Match patterns like "scheduled after 2024-02-07"
    const scheduledAfterMatch = filter.match(/^scheduled\s+after\s+(\d{4}-\d{2}-\d{2})$/);
    if (scheduledAfterMatch) {
      const targetDate = scheduledAfterMatch[1];
      return task.scheduledDate !== undefined && task.scheduledDate > targetDate;
    }
  }

  // Start date filters
  if (filter.startsWith('starts') || filter === 'has start date' || filter === 'no start date') {
    if (filter === 'starts today') {
      const today = moment().format('YYYY-MM-DD');
      return task.startDate === today;
    }
    if (filter === 'starts before today') {
      const today = moment().format('YYYY-MM-DD');
      return task.startDate !== undefined && task.startDate < today;
    }
    if (filter === 'starts after today') {
      const today = moment().format('YYYY-MM-DD');
      return task.startDate !== undefined && task.startDate > today;
    }
    if (filter === 'no start date') {
      return task.startDate === undefined;
    }
    if (filter === 'has start date') {
      return task.startDate !== undefined;
    }

    // Handle specific date patterns
    // Match patterns like "starts 2024-02-07", "starts on 2024-02-07"
    const startsDateMatch = filter.match(/^starts\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})$/);
    if (startsDateMatch) {
      const targetDate = startsDateMatch[1];
      return task.startDate === targetDate;
    }

    // Match patterns like "starts before 2024-02-07"
    const startsBeforeMatch = filter.match(/^starts\s+before\s+(\d{4}-\d{2}-\d{2})$/);
    if (startsBeforeMatch) {
      const targetDate = startsBeforeMatch[1];
      return task.startDate !== undefined && task.startDate < targetDate;
    }

    // Match patterns like "starts after 2024-02-07"
    const startsAfterMatch = filter.match(/^starts\s+after\s+(\d{4}-\d{2}-\d{2})$/);
    if (startsAfterMatch) {
      const targetDate = startsAfterMatch[1];
      return task.startDate !== undefined && task.startDate > targetDate;
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
    const pathToFind = filter.split('includes')[1].trim().replace(/^["']|["']$/g, '');
    return task.filePath.toLowerCase().includes(pathToFind.toLowerCase());
  }
  
  if (filter.startsWith('path does not include')) {
    const pathToExclude = filter.split('does not include')[1].trim().replace(/^["']|["']$/g, '');
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
 * Complete a task by updating its status and adding completion date.
 * If the task is recurring, creates a new occurrence below the completed task.
 * 
 * @param id Task ID in format "filePath:lineNumber"
 * @returns Promise with success status and message
 */
export async function completeTask(id: string): Promise<{ success: boolean; message: string }> {
  // Setup debug logging for task completion
  const debugLog = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `${timestamp} [COMPLETE_TASK_INTERNAL] ${msg}\n`;
    console.error(logMsg.trim());
    try {
      appendFileSync('/tmp/obsidian-mcp-debug.log', logMsg);
    } catch (e) {
      // Ignore file errors
    }
  };

  try {
    debugLog(`Starting completeTask function with ID: ${id}`);
    
    // Parse the task ID to extract file path and line number
    const lastColonIndex = id.lastIndexOf(':');
    if (lastColonIndex === -1) {
      debugLog(`Invalid task ID format - no colon found: ${id}`);
      return { success: false, message: `Invalid task ID format: ${id}. Expected format: filePath:lineNumber` };
    }
    
    const filePath = id.substring(0, lastColonIndex);
    const lineNumberStr = id.substring(lastColonIndex + 1);
    const lineNumber = parseInt(lineNumberStr, 10);
    
    debugLog(`Parsed task ID - File: ${filePath}, Line: ${lineNumberStr} (parsed as ${lineNumber})`);
    
    if (isNaN(lineNumber)) {
      debugLog(`Line number parsing failed: ${lineNumberStr} is not a valid number`);
      return { success: false, message: `Invalid line number in task ID: ${lineNumberStr}` };
    }
    
    // Read the file content
    debugLog(`Attempting to read file: ${filePath}`);
    const fs = await import('fs/promises');
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
      debugLog(`Successfully read file, content length: ${fileContent.length} characters`);
    } catch (error) {
      debugLog(`Failed to read file ${filePath}: ${error}`);
      return { success: false, message: `Failed to read file: ${filePath}. Error: ${error}` };
    }
    
    const lines = fileContent.split('\n');
    debugLog(`File split into ${lines.length} lines`);
    
    // Check if line number is valid (1-based indexing)
    if (lineNumber < 1 || lineNumber > lines.length) {
      debugLog(`Line number ${lineNumber} is out of range (file has ${lines.length} lines)`);
      return { success: false, message: `Line number ${lineNumber} is out of range for file with ${lines.length} lines` };
    }
    
    const targetLineIndex = lineNumber - 1; // Convert to 0-based indexing
    const originalLine = lines[targetLineIndex];
    debugLog(`Target line (${lineNumber}): "${originalLine}"`);
    
    // Parse the task to get all its information
    debugLog(`Parsing task line to extract task information...`);
    const task = parseTaskLine(originalLine, filePath, lineNumber);
    if (!task) {
      debugLog(`Failed to parse line as task: "${originalLine}"`);
      return { success: false, message: `Line ${lineNumber} is not a valid task: ${originalLine}` };
    }
    
    debugLog(`Task parsed successfully:`);
    debugLog(`  - Description: "${task.description}"`);
    debugLog(`  - Status: ${task.status} (symbol: ${task.statusSymbol})`);
    debugLog(`  - Due date: ${task.dueDate || 'none'}`);
    debugLog(`  - Scheduled: ${task.scheduledDate || 'none'}`);
    debugLog(`  - Start: ${task.startDate || 'none'}`);  
    debugLog(`  - Priority: ${task.priority || 'none'}`);
    debugLog(`  - Recurrence: ${task.recurrence || 'none'}`);
    debugLog(`  - Tags: [${task.tags.join(', ')}]`);
    debugLog(`  - Urgency: ${task.urgency}`);
    
    // Check if task is already completed
    if (task.status === 'complete') {
      debugLog(`Task is already completed, aborting completion`);
      return { success: false, message: `Task is already completed: ${originalLine}` };
    }
    
    // Update the task status and add completion date
    const completionDate = new Date();
    const today = moment(completionDate).format('YYYY-MM-DD');
    const completionEmoji = ` ✅ ${today}`;
    
    // Create a normalized completion date for recurrence calculation (start of day in local timezone)
    const normalizedCompletionDate = moment(today, 'YYYY-MM-DD').toDate();
    
    debugLog(`Raw completion date: ${completionDate.toISOString()}`);
    debugLog(`Formatted today string: ${today}`);
    debugLog(`Normalized completion date for recurrence calc: ${normalizedCompletionDate.toISOString()}`);
    debugLog(`Completion emoji: "${completionEmoji}"`);
    
    // Replace the status character with 'x' and add completion date
    let updatedLine = originalLine.replace(TaskRegex.checkboxRegex, '[x]');
    debugLog(`After status replacement: "${updatedLine}"`);
    
    // Add completion date if not already present
    if (!updatedLine.includes('✅')) {
      updatedLine += completionEmoji;
      debugLog(`Added completion emoji: "${updatedLine}"`);
    } else {
      debugLog(`Completion emoji already present, skipping addition`);
    }
    
    // Update the line in the array
    lines[targetLineIndex] = updatedLine;
    debugLog(`Updated line array at index ${targetLineIndex}`);
    
    let resultMessage = `Task completed successfully. Updated: ${originalLine} -> ${updatedLine}`;
    
    // Handle recurring tasks
    if (task.recurrence) {
      debugLog(`Task has recurrence rule: "${task.recurrence}" - processing next occurrence...`);
      try {
        debugLog(`Calling RecurrenceUtils.calculateNextOccurrence with normalized completion date: ${normalizedCompletionDate.toISOString()}`);
        const nextOccurrence = RecurrenceUtils.calculateNextOccurrence(task, normalizedCompletionDate);
        
        if (nextOccurrence) {
          debugLog(`Next occurrence calculated successfully:`);
          debugLog(`  - New task ID: ${nextOccurrence.id}`);
          debugLog(`  - Description: "${nextOccurrence.description}"`);
          debugLog(`  - Status: ${nextOccurrence.status} (symbol: ${nextOccurrence.statusSymbol})`);
          debugLog(`  - Due date: ${nextOccurrence.dueDate || 'none'}`);
          debugLog(`  - Scheduled: ${nextOccurrence.scheduledDate || 'none'}`);
          debugLog(`  - Start: ${nextOccurrence.startDate || 'none'}`);
          debugLog(`  - Priority: ${nextOccurrence.priority || 'none'}`);
          debugLog(`  - Recurrence: ${nextOccurrence.recurrence || 'none'}`);
          debugLog(`  - Urgency: ${nextOccurrence.urgency}`);
          debugLog(`  - Original markdown: "${nextOccurrence.originalMarkdown}"`);
          
          // Insert the new recurring task below the completed task (after targetLineIndex)
          const insertIndex = targetLineIndex + 1;
          debugLog(`Inserting new task at index ${insertIndex} (after completed task)`);
          
          // Extract indentation from the original line
          const indentMatch = originalLine.match(TaskRegex.indentationRegex);
          const indentation = indentMatch ? indentMatch[1] : '';
          debugLog(`Extracted indentation: "${indentation}" (length: ${indentation.length})`);
          
          // Build the new task line with proper indentation
          let newTaskLine = nextOccurrence.originalMarkdown;
          debugLog(`Initial new task line: "${newTaskLine}"`);
          
          if (indentation && !newTaskLine.startsWith(indentation)) {
            // Replace the beginning of the line with the correct indentation
            const originalIndent = newTaskLine.match(/^[\s\t>]*/)?.[0] || '';
            newTaskLine = newTaskLine.replace(/^[\s\t>]*/, '');
            newTaskLine = indentation + newTaskLine;
            debugLog(`Applied indentation: "${originalIndent}" -> "${indentation}"`);
            debugLog(`Final new task line: "${newTaskLine}"`);
          } else {
            debugLog(`No indentation changes needed`);
          }
          
          // Insert the new task line
          lines.splice(insertIndex, 0, newTaskLine);
          debugLog(`Inserted new task line at index ${insertIndex}, total lines now: ${lines.length}`);
          
          resultMessage += `\nCreated next recurring task: ${newTaskLine}`;
        } else {
          debugLog(`RecurrenceUtils.calculateNextOccurrence returned null - unable to calculate next occurrence`);
          resultMessage += '\nNote: Could not calculate next occurrence for recurring task (check recurrence rule)';
        }
      } catch (recurrenceError) {
        debugLog(`Error calculating next occurrence: ${recurrenceError}`);
        if (recurrenceError instanceof Error && recurrenceError.stack) {
          debugLog(`Recurrence error stack trace: ${recurrenceError.stack}`);
        }
        resultMessage += `\nWarning: Error creating next occurrence: ${recurrenceError}`;
      }
    } else {
      debugLog(`Task has no recurrence rule, skipping recurring task logic`);
    }
    
    // Write the updated content back to the file
    const updatedContent = lines.join('\n');
    debugLog(`Preparing to write updated content back to file (${updatedContent.length} characters)`);
    
    try {
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      debugLog(`Successfully wrote updated content to file: ${filePath}`);
    } catch (error) {
      debugLog(`Failed to write file ${filePath}: ${error}`);
      return { success: false, message: `Failed to write file: ${filePath}. Error: ${error}` };
    }
    
    debugLog(`Task completion successful. Final result message: ${resultMessage}`);
    return { 
      success: true, 
      message: resultMessage
    };
    
  } catch (error) {
    debugLog(`Unexpected error in completeTask: ${error}`);
    if (error instanceof Error && error.stack) {
      debugLog(`Error stack trace: ${error.stack}`);
    }
    return { 
      success: false, 
      message: `Unexpected error completing task: ${error}` 
    };
  }
}