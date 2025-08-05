/**
 * TaskParser - Inspired by Obsidian Tasks but simplified for MCP
 * 
 * This file contains a simplified implementation inspired by Obsidian Tasks
 * but without the dependency complexity.
 */

import moment from 'moment';
import * as rruleModule from 'rrule';
const RRule = rruleModule.RRule;
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
    try {
      const lowerRule = rule.toLowerCase();
      
      // Handle basic patterns
      if (lowerRule.startsWith('every ')) {
        const pattern = lowerRule.substring(6); // Remove 'every '
        
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
        
        // Weekly with specific days
        if (pattern.startsWith('week on ')) {
          const daysPart = pattern.substring(8); // Remove 'week on '
          const weekdays = RecurrenceUtils.parseWeekdays(daysPart);
          if (weekdays.length > 0) {
            return new RRule({
              freq: RRule.WEEKLY,
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
    if (!task.recurrence) return null;
    
    const { rule, whenDone } = RecurrenceUtils.parseRecurrenceRule(task.recurrence);
    
    // Determine reference date based on "when done" flag
    let referenceDate: Date;
    if (whenDone && completionDate) {
      referenceDate = completionDate;
    } else {
      const taskReferenceDate = RecurrenceUtils.getReferenceDate(task);
      if (!taskReferenceDate) {
        return null;
      }
      referenceDate = taskReferenceDate;
    }
    
    // Classify pattern and calculate next occurrence
    let nextDate: Date;
    const patternType = RecurrenceUtils.classifyPattern(rule);
    
    if (patternType === 'simple') {
      const simplePattern = RecurrenceUtils.parseSimplePattern(rule);
      if (!simplePattern) {
        return null;
      }
      nextDate = RecurrenceUtils.calculateSimpleNextOccurrence(simplePattern, referenceDate);
    } else {
      // Use RRule for complex patterns
      const rrule = RecurrenceUtils.obsidianToRRule(rule, referenceDate);
      if (!rrule) {
        return null;
      }
      
      const rruleNext = rrule.after(referenceDate);
      if (!rruleNext) {
        return null;
      }
      nextDate = rruleNext;
    }
    
    // Create new task with updated dates
    const newTask: Task = {
      ...task,
      id: `${task.filePath}:${task.lineNumber + 1}`, // Will be updated when inserted
      status: 'incomplete',
      statusSymbol: ' ',
      originalMarkdown: '' // Will be built below
    };
    
    // Update dates based on recurrence logic
    if (whenDone && completionDate) {
      // For "when done" tasks, nextDate is already completion date + interval
      // Set nextDate as the primary date and maintain relative relationships
      const primaryDateField = RecurrenceUtils.getPrimaryDateField(task);
      
      if (primaryDateField === 'dueDate') {
        const nextDateMoment = moment.utc(nextDate);
        newTask.dueDate = nextDateMoment.format('YYYY-MM-DD');
        
        // Maintain relative relationships if other dates exist
        if (task.scheduledDate && task.dueDate) {
          const scheduledOffset = moment(task.scheduledDate).diff(moment(task.dueDate), 'days');
          const newScheduled = moment(nextDate).add(scheduledOffset, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
        }
        
        if (task.startDate && task.dueDate) {
          const startOffset = moment(task.startDate).diff(moment(task.dueDate), 'days');
          const newStart = moment(nextDate).add(startOffset, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
        }
      } else if (primaryDateField === 'scheduledDate') {
        newTask.scheduledDate = moment(nextDate).format('YYYY-MM-DD');
        
        if (task.dueDate && task.scheduledDate) {
          const dueOffset = moment(task.dueDate).diff(moment(task.scheduledDate), 'days');
          const newDue = moment(nextDate).add(dueOffset, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
        }
        
        if (task.startDate && task.scheduledDate) {
          const startOffset = moment(task.startDate).diff(moment(task.scheduledDate), 'days');
          const newStart = moment(nextDate).add(startOffset, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
        }
      } else if (primaryDateField === 'startDate') {
        newTask.startDate = moment(nextDate).format('YYYY-MM-DD');
        
        if (task.dueDate && task.startDate) {
          const dueOffset = moment(task.dueDate).diff(moment(task.startDate), 'days');
          const newDue = moment(nextDate).add(dueOffset, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
        }
        
        if (task.scheduledDate && task.startDate) {
          const scheduledOffset = moment(task.scheduledDate).diff(moment(task.startDate), 'days');
          const newScheduled = moment(nextDate).add(scheduledOffset, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
        }
      } else {
        // No primary date field, default to due date
        newTask.dueDate = moment(nextDate).format('YYYY-MM-DD');
      }
    } else {
      // For original date-based recurrence, calculate offset from original primary date
      const primaryDateField = RecurrenceUtils.getPrimaryDateField(task);
      const originalPrimaryDate = RecurrenceUtils.getDateFromTask(task, primaryDateField);
      
      if (originalPrimaryDate) {
        const daysDiff = moment(nextDate).diff(moment(originalPrimaryDate), 'days');
        
        // Update all dates maintaining their relative relationships
        if (task.dueDate) {
          const originalDue = moment(task.dueDate);
          const newDue = originalDue.clone().add(daysDiff, 'days');
          newTask.dueDate = moment(RecurrenceUtils.ensureValidDate(newDue.toDate())).format('YYYY-MM-DD');
        }
        
        if (task.scheduledDate) {
          const originalScheduled = moment(task.scheduledDate);
          const newScheduled = originalScheduled.clone().add(daysDiff, 'days');
          newTask.scheduledDate = moment(RecurrenceUtils.ensureValidDate(newScheduled.toDate())).format('YYYY-MM-DD');
        }
        
        if (task.startDate) {
          const originalStart = moment(task.startDate);
          const newStart = originalStart.clone().add(daysDiff, 'days');
          newTask.startDate = moment(RecurrenceUtils.ensureValidDate(newStart.toDate())).format('YYYY-MM-DD');
        }
      } else {
        // If no primary date, set the next occurrence directly as due date
        newTask.dueDate = moment(nextDate).format('YYYY-MM-DD');
      }
    }
    
    // Remove completion date from new task
    newTask.createdDate = undefined;
    
    // Recalculate urgency for the new task
    newTask.urgency = calculateUrgency(newTask);
    
    // Build the new task markdown
    newTask.originalMarkdown = RecurrenceUtils.buildTaskMarkdown(newTask);
    
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
 * Complete a task by updating its status and adding completion date.
 * If the task is recurring, creates a new occurrence below the completed task.
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
    
    // Parse the task to get all its information
    const task = parseTaskLine(originalLine, filePath, lineNumber);
    if (!task) {
      return { success: false, message: `Line ${lineNumber} is not a valid task: ${originalLine}` };
    }
    
    // Check if task is already completed
    if (task.status === 'complete') {
      return { success: false, message: `Task is already completed: ${originalLine}` };
    }
    
    // Update the task status and add completion date
    const completionDate = new Date();
    const today = moment(completionDate).format('YYYY-MM-DD');
    const completionEmoji = ` ✅ ${today}`;
    
    // Replace the status character with 'x' and add completion date
    let updatedLine = originalLine.replace(TaskRegex.checkboxRegex, '[x]');
    
    // Add completion date if not already present
    if (!updatedLine.includes('✅')) {
      updatedLine += completionEmoji;
    }
    
    // Update the line in the array
    lines[targetLineIndex] = updatedLine;
    
    let resultMessage = `Task completed successfully. Updated: ${originalLine} -> ${updatedLine}`;
    
    // Handle recurring tasks
    if (task.recurrence) {
      try {
        const nextOccurrence = RecurrenceUtils.calculateNextOccurrence(task, completionDate);
        
        if (nextOccurrence) {
          // Insert the new recurring task below the completed task (after targetLineIndex)
          const insertIndex = targetLineIndex + 1;
          
          // Extract indentation from the original line
          const indentMatch = originalLine.match(TaskRegex.indentationRegex);
          const indentation = indentMatch ? indentMatch[1] : '';
          
          // Build the new task line with proper indentation
          let newTaskLine = nextOccurrence.originalMarkdown;
          if (indentation && !newTaskLine.startsWith(indentation)) {
            // Replace the beginning of the line with the correct indentation
            newTaskLine = newTaskLine.replace(/^[\s\t>]*/, '') ;
            newTaskLine = indentation + newTaskLine;
          }
          
          // Insert the new task line
          lines.splice(insertIndex, 0, newTaskLine);
          
          resultMessage += `\nCreated next recurring task: ${newTaskLine}`;
        } else {
          resultMessage += '\nNote: Could not calculate next occurrence for recurring task (check recurrence rule)';
        }
      } catch (recurrenceError) {
        resultMessage += `\nWarning: Error creating next occurrence: ${recurrenceError}`;
      }
    }
    
    // Write the updated content back to the file
    const updatedContent = lines.join('\n');
    try {
      await fs.writeFile(filePath, updatedContent, 'utf-8');
    } catch (error) {
      return { success: false, message: `Failed to write file: ${filePath}. Error: ${error}` };
    }
    
    return { 
      success: true, 
      message: resultMessage
    };
    
  } catch (error) {
    return { 
      success: false, 
      message: `Unexpected error completing task: ${error}` 
    };
  }
}