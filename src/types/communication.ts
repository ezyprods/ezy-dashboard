export type TemplateType = 'project_update' | 'file_ready' | 'payment_reminder' | 'project_delivered' | 'custom';
export type ReminderType = 'email' | 'in_app' | 'both';

export interface EmailTemplate {
  id: string;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  isDefault: boolean;
}

export interface ScheduledEmail {
  artistId: string;
  templateId?: string;
  subject: string;
  body: string;
  scheduledAt?: string;
  sentAt?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  songId?: string;
  artistId?: string;
  date: string;
  time: string;
  type: ReminderType;
  completed: boolean;
  createdAt: string;
}

export interface WhatsAppMessage {
  artistName: string;
  phone: string;
  message: string;
}
