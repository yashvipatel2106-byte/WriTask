import type { LucideIcon } from "lucide-react";
import { CONTACT_FORM_URL } from "@/lib/constants/contact";
import {
  Sparkles,
  UserPlus,
  LogIn,
  Building2,
  PlusCircle,
  Layers,
  Mail,
  FolderPlus,
  Archive,
  RotateCcw,
  ListPlus,
  ArrowLeftRight,
  UserCheck,
  Flag,
  Paperclip,
  Columns3,
  RefreshCw,
  Calendar,
  CalendarCheck,
  ShieldCheck,
  AtSign,
  Activity,
  Bell,
  CheckCheck,
  BarChart3,
  Gauge,
  Search,
  UserCog,
  Lock,
  MessageCircle,
  Users,
  Settings,
} from "lucide-react";

export type FaqItem = {
  icon: LucideIcon;
  question: string;
  answer: string;
  link?: { label: string; href: string };
};

export type FaqCategory = {
  title: string;
  icon: LucideIcon;
  items: FaqItem[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: "Getting Started",
    icon: Sparkles,
    items: [
      {
        icon: Sparkles,
        question: "What is WriTask?",
        answer:
          "WriTask is a project management and team collaboration platform that helps teams organize projects, manage tasks, collaborate in real time, and monitor progress from one centralized workspace.",
      },
      {
        icon: UserPlus,
        question: "How do I create an account?",
        answer:
          "Click Sign Up, enter your details, verify your email with the OTP, and complete your profile to start using WriTask.",
      },
      {
        icon: LogIn,
        question: "How do I log in to my account?",
        answer:
          "Use your registered email address and password. If you've forgotten your password, you can reset it using the Forgot Password option.",
      },
    ],
  },
  {
    title: "Organization",
    icon: Building2,
    items: [
      {
        icon: Building2,
        question: "What is an Organization?",
        answer:
          "An Organization is your team's workspace where projects, members, roles, and resources are managed together.",
      },
      {
        icon: PlusCircle,
        question: "How do I create a new organization?",
        answer:
          "Navigate to Organizations and click Create Organization. Enter the organization details and invite your team members.",
      },
      {
        icon: Layers,
        question: "Can I belong to multiple organizations?",
        answer:
          "Yes. WriTask allows you to switch between multiple organizations without creating separate accounts.",
      },
      {
        icon: Mail,
        question: "How do I invite members to my organization?",
        answer:
          "Go to Organization Members, click Invite Member, enter their email address, choose a role, and send the invitation.",
      },
    ],
  },
  {
    title: "Projects",
    icon: FolderPlus,
    items: [
      {
        icon: FolderPlus,
        question: "How do I create a project?",
        answer:
          "Open your organization, click Create Project, enter the project information, assign members, and save.",
      },
      {
        icon: Archive,
        question: "Can I archive or delete projects?",
        answer:
          "Yes. Projects can be archived when completed or moved to Trash if deleted accidentally.",
      },
      {
        icon: RotateCcw,
        question: "Can I restore deleted projects?",
        answer:
          "Yes. Deleted projects can be restored from the Trash section before they are permanently removed.",
      },
    ],
  },
  {
    title: "Tasks",
    icon: ListPlus,
    items: [
      {
        icon: ListPlus,
        question: "How do I create a task?",
        answer:
          "Inside a project, click Add Task, provide task details, assign team members, set due dates, and save.",
      },
      {
        icon: ArrowLeftRight,
        question: "Can I move tasks between columns?",
        answer:
          "Yes. Simply drag and drop tasks across Kanban columns like To Do, In Progress, Review, and Completed.",
      },
      {
        icon: UserCheck,
        question: "Can I assign tasks to team members?",
        answer: "Yes. Every task can be assigned to one or multiple members.",
      },
      {
        icon: Flag,
        question: "Can I set task priorities?",
        answer: "Yes. Tasks support Low, Medium, High, and Urgent priority levels.",
      },
      {
        icon: Paperclip,
        question: "Can I attach files or add comments to tasks?",
        answer:
          "Yes. Each task supports attachments, comments, and activity history to improve collaboration.",
      },
    ],
  },
  {
    title: "Kanban Board",
    icon: Columns3,
    items: [
      {
        icon: Columns3,
        question: "What is the Kanban Board?",
        answer:
          "The Kanban Board provides a visual way to organize tasks using drag-and-drop columns based on their current status.",
      },
      {
        icon: RefreshCw,
        question: "Does the Kanban Board update automatically?",
        answer:
          "Yes. Changes made by team members are reflected in real time, keeping everyone synchronized.",
      },
    ],
  },
  {
    title: "Calendar",
    icon: Calendar,
    items: [
      {
        icon: Calendar,
        question: "How does the Calendar work?",
        answer:
          "The Calendar displays upcoming deadlines, meetings, milestones, and scheduled tasks in one place.",
      },
      {
        icon: CalendarCheck,
        question: "Are task due dates automatically shown on the Calendar?",
        answer: "Yes. Tasks with due dates automatically appear on the Calendar.",
      },
    ],
  },
  {
    title: "Members & Collaboration",
    icon: Users,
    items: [
      {
        icon: ShieldCheck,
        question: "What user roles are available?",
        answer:
          "WriTask supports roles such as Owner, Admin, Manager, Member, and Guest, each with different permissions.",
      },
      {
        icon: AtSign,
        question: "Can I mention teammates inside tasks?",
        answer: "Yes. Use @mentions in comments to notify teammates directly.",
      },
      {
        icon: Activity,
        question: "How can I view team activities?",
        answer:
          "Visit the Activity page to see project updates, task changes, comments, invitations, and other recent actions.",
      },
    ],
  },
  {
    title: "Notifications & Inbox",
    icon: Bell,
    items: [
      {
        icon: Bell,
        question: "When will I receive notifications?",
        answer:
          "You'll receive notifications for task assignments, mentions, comments, invitations, due dates, and project updates.",
      },
      {
        icon: CheckCheck,
        question: "Can I mark notifications as read or archive them?",
        answer:
          "Yes. Notifications can be marked as read individually or archived for better inbox organization.",
      },
    ],
  },
  {
    title: "Reports & Workload",
    icon: BarChart3,
    items: [
      {
        icon: BarChart3,
        question: "What reports are available?",
        answer:
          "Open Reports to build custom tables from folders and projects in your current workspace. My Report still shows your personal weekly summary.",
      },
      {
        icon: Gauge,
        question: "What is the Workload page?",
        answer:
          "The Workload page helps managers view team capacity, assigned tasks, and balance work across members.",
      },
    ],
  },
  {
    title: "Search",
    icon: Search,
    items: [
      {
        icon: Search,
        question: "Can I search for projects, tasks, or members?",
        answer:
          "Yes. Use the global search to quickly find projects, tasks, organizations, documents, and team members.",
      },
    ],
  },
  {
    title: "Settings & Profile",
    icon: Settings,
    items: [
      {
        icon: UserCog,
        question: "Can I update my profile information?",
        answer:
          "Yes. You can update your name, profile picture, password, and account settings from the Profile page.",
      },
    ],
  },
  {
    title: "Security",
    icon: Lock,
    items: [
      {
        icon: Lock,
        question: "Is my data secure?",
        answer:
          "Yes. WriTask uses secure authentication, encrypted communication, role-based access control, and verified user permissions to keep your data protected.",
      },
    ],
  },
  {
    title: "Support",
    icon: MessageCircle,
    items: [
      {
        icon: MessageCircle,
        question: "How can I contact support?",
        answer:
          "If you need help, submit a support request through our contact form and we'll get back to you. We're happy to assist with any questions or technical issues.",
        link: { label: "Open support form", href: CONTACT_FORM_URL },
      },
    ],
  },
];
