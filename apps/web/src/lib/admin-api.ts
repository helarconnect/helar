import { authenticatedHttp } from "@/lib/http";
import type { ActiveSubscriptionSummary, SubscriptionPaymentSummary } from "@/lib/api";
import type { DashboardMetric } from "@/types/domain";

export type AdminLibrarySection = "law-reports" | "subject-summaries" | "cases-and-ratios";
export type AdminLibraryMaterialType =
  | "PDF"
  | "DOCX"
  | "EPUB"
  | "PPT"
  | "VIDEO"
  | "AUDIO"
  | "IMAGE"
  | "COURT_OF_APPEAL"
  | "FEDERAL_HIGH_COURT"
  | "HIGH_COURT"
  | "SUPREME_COURT"
  | "TRIBUNAL";

export type PremiumContentAccess = {
  activeSubscriptionEndsAt: string | null;
  hasFullAccess: boolean;
  isPreview: boolean;
  previewWordLimit: number;
  requiresSubscription: boolean;
  upgradeMessage: string;
};

export type AdminBillingUser = {
  activeSubscription: ActiveSubscriptionSummary | null;
  email: string;
  emailVerifiedAt: string | null;
  fullName: string;
  id: string;
  latestPayment: SubscriptionPaymentSummary | null;
  latestSubscription: ActiveSubscriptionSummary | null;
  phoneNumber: string | null;
  registeredAt: string;
  roleCodes: string[];
  subscriptionPlanCode: "monthly" | "six_months" | "annual" | null;
  subscriptionInterval: "MONTHLY" | "ANNUAL" | null;
  subscriptionStatus: "active" | "canceled" | "expired" | "inactive" | "past_due";
  userStatus: "ACTIVE" | "SUSPENDED" | "PENDING";
};

export type AdminBillingSnapshot = {
  recentPayments: Array<
    SubscriptionPaymentSummary & {
      subscriptionStatus: AdminBillingUser["subscriptionStatus"];
      user: {
        email: string;
        fullName: string;
        id: string;
      };
    }
  >;
  summary: {
    activeSubscriptions: number;
    annualSubscribers: number;
    failedPayments: number;
    monthlySubscribers: number;
    pendingPayments: number;
    sixMonthSubscribers: number;
    registeredUsers: number;
  };
  users: AdminBillingUser[];
};

export type AdminManualActivationInput = {
  note?: string;
  planCode: "monthly" | "six_months" | "annual";
  userId: string;
};

export type AdminLibraryFilters = {
  materialType?: "all" | AdminLibraryMaterialType;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "createdAt" | "estimatedMins" | "title" | "updatedAt";
  sortOrder?: "asc" | "desc";
};

export type AdminLibraryMaterial = {
  approvedAt: string | null;
  bookmarkCount: number;
  body: string;
  createdAt: string;
  downloadable: boolean;
  estimatedMins: number;
  id: string;
  lastUpdatedAt: string;
  materialType: AdminLibraryMaterialType;
  publicationStatus: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "ARCHIVED";
  readerCount: number;
  reviewFeedback: string;
  reportDate: string | null;
  reportNumber: string | null;
  sharingEnabled: boolean;
  storageUrl: string;
  summary: string;
  title: string;
};

export type AdminLibrarySnapshot = {
  availableMaterialTypes: AdminLibraryMaterialType[];
  category: {
    description: string | null;
    id: string;
    name: string;
    slug: string;
  };
  filters: Required<AdminLibraryFilters>;
  materials: AdminLibraryMaterial[];
  nextReportNumber: string | null;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    averageReadTimeMins: number;
    downloadableCount: number;
    lawReportEngagement: {
      topReports: Array<{
        id: string;
        reportNumber: string | null;
        title: string;
        totalHoursSpent: number;
        visits: number;
      }>;
      totalHoursSpent: number;
      totalVisits: number;
    } | null;
    recentUploadsCount: number;
    totalMaterials: number;
  };
};

export type AdminLibraryMaterialDetail = {
  access?: PremiumContentAccess;
  category: {
    description: string | null;
    id: string;
    name: string;
    slug: string;
  };
  material: AdminLibraryMaterial;
};

export type AdminLibrarySearchResult = {
  id: string;
  materialType: AdminLibraryMaterialType;
  matchedIn: "body" | "reportNumber" | "storageUrl" | "summary" | "title";
  path: string;
  reportNumber: string | null;
  section: AdminLibrarySection;
  sectionLabel: string;
  snippet: string;
  title: string;
};

export type AdminPortalSearchItem = {
  badge: string | null;
  id: string;
  kind: "user" | "library_material" | "subject_summary_subject" | "subject_summary_topic" | "subject_summary_case" | "subject_summary_entry";
  path: string;
  snippet: string;
  subtitle: string;
  title: string;
};

export type AdminPortalSearchGroup = {
  items: AdminPortalSearchItem[];
  key: "users" | "library" | "subjects" | "topics" | "cases" | "entries";
  label: string;
};

export type AdminPortalSearchResponse = {
  groups: AdminPortalSearchGroup[];
  totalResults: number;
};

export type AdminLibraryMaterialInput = {
  body: string;
  downloadable: boolean;
  estimatedMins: number;
  materialType: AdminLibraryMaterialType;
  reportDate?: string;
  reportNumber?: string;
  sharingEnabled: boolean;
  storageUrl: string;
  summary: string;
  title: string;
};

export type SubjectSummaryStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type SubjectSummaryCaseStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "ARCHIVED";

export type AdminNotificationItemType =
  | "library_material"
  | "subject_summary_case"
  | "subject_summary_entry"
  | "bar_final_exam_question"
  | "user_notification";

export type AdminNotificationItem = {
  actionPath: string;
  body: string;
  canApprove: boolean;
  createdAt: string;
  id: string;
  resourceId: string | null;
  title: string;
  type: AdminNotificationItemType;
};

export type AdminNotificationCenter = {
  items: AdminNotificationItem[];
  unreadCount: number;
};

export type AdminApprovalQueueItem = {
  actionPath: string;
  contentTypeLabel: string;
  createdAt: string;
  editPath: string;
  id: string;
  reviewPath: string;
  resourceId: string;
  submittedBy: string;
  submittedRoleLabel: string;
  subtitle: string;
  title: string;
  type: "library_material" | "subject_summary_case" | "subject_summary_entry" | "bar_final_exam_question";
};

export type AdminApprovalQueueSnapshot = {
  items: AdminApprovalQueueItem[];
  summary: {
    itemsSubmittedToday: number;
    barFinalExamQuestions: number;
    libraryMaterials: number;
    oldestPendingHours: number;
    subjectSummaryCases: number;
    subjectSummaryEntries: number;
    totalPending: number;
  };
};

export type SubjectSummarySubject = {
  caseCount: number;
  createdAt: string;
  description: string;
  displayOrder: number;
  id: string;
  name: string;
  status: SubjectSummaryStatus;
  topicCount: number;
  updatedAt: string;
};

export type SubjectSummaryTopic = {
  caseCount: number;
  createdAt: string;
  description: string;
  displayOrder: number;
  id: string;
  name: string;
  status: SubjectSummaryStatus;
  subject: {
    id: string;
    name: string;
  };
  subjectId: string;
  updatedAt: string;
};

export type SubjectSummaryCase = {
  activeSubscriptionEndsAt?: string | null;
  attachments: string[];
  caseSummary: string;
  citation: string;
  court: string;
  createdAt: string;
  decisionHolding: string;
  externalReferences: string[];
  facts: string;
  hasFullAccess?: boolean;
  id: string;
  isPreview?: boolean;
  issues: string;
  judges: string[];
  jurisdiction: string;
  keywords: string[];
  legalPrinciples: string[];
  obiterDicta: string;
  ratioDecidendi: string;
  relatedCases: string[];
  relatedStatutes: string[];
  requiresSubscription?: boolean;
  previewWordLimit?: number;
  reviewFeedback: string;
  status: SubjectSummaryCaseStatus;
  subject: {
    id: string;
    name: string;
  };
  subjectId: string;
  title: string;
  topic: {
    id: string;
    name: string;
  };
  topicId: string;
  updatedAt: string;
  upgradeMessage?: string;
  year: number | null;
};

export type SubjectSummarySubjectFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "createdAt" | "displayOrder" | "name" | "updatedAt";
  sortOrder?: "asc" | "desc";
  status?: "all" | SubjectSummaryStatus;
};

export type SubjectSummaryTopicFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "createdAt" | "displayOrder" | "name" | "updatedAt";
  sortOrder?: "asc" | "desc";
  status?: "all" | SubjectSummaryStatus;
  subjectId?: string;
};

export type SubjectSummaryCaseFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "createdAt" | "title" | "updatedAt" | "year";
  sortOrder?: "asc" | "desc";
  status?: "all" | SubjectSummaryCaseStatus;
  subjectId?: string;
  topicId?: string;
};

export type SubjectSummarySubjectInput = {
  description: string;
  displayOrder: number;
  name: string;
  status: SubjectSummaryStatus;
};

export type SubjectSummaryTopicInput = {
  description: string;
  displayOrder: number;
  name: string;
  status: SubjectSummaryStatus;
  subjectId: string;
};

export type SubjectSummaryCaseInput = {
  attachments: string[];
  caseSummary: string;
  citation: string;
  court: string;
  decisionHolding: string;
  externalReferences: string[];
  facts: string;
  issues: string;
  judges: string[];
  jurisdiction: string;
  keywords: string[];
  legalPrinciples: string[];
  obiterDicta: string;
  ratioDecidendi: string;
  relatedCases: string[];
  relatedStatutes: string[];
  status: SubjectSummaryCaseStatus;
  subjectId: string;
  title: string;
  topicId: string;
  year: number | null;
};

export type SubjectSummarySubjectList = {
  items: SubjectSummarySubject[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    activeCount: number;
    archivedCount: number;
    inactiveCount: number;
    totalSubjects: number;
  };
};

export type SubjectSummaryTopicList = {
  items: SubjectSummaryTopic[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    activeCount: number;
    archivedCount: number;
    inactiveCount: number;
    totalTopics: number;
  };
};

export type SubjectSummaryCaseList = {
  items: SubjectSummaryCase[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    archivedCount: number;
    draftCount: number;
    publishedCount: number;
    totalCases: number;
  };
  topics: Array<{
    id: string;
    name: string;
    subjectId: string;
  }>;
};

export type SubjectSummaryHierarchySubject = SubjectSummarySubject & {
  hasTopics: boolean;
};

export type SubjectSummaryHierarchyTopic = SubjectSummaryTopic & {
  hasCases: boolean;
};

export type SubjectSummaryHierarchyResponse = {
  items: SubjectSummaryHierarchySubject[];
};

export type SubjectSummaryHierarchyTopicResponse = {
  items: SubjectSummaryHierarchyTopic[];
};

export type SubjectSummaryHierarchyCaseResponse = {
  items: SubjectSummaryCase[];
};

export type SubjectSummaryAutocompleteResult = {
  id: string;
  label: string;
  path: string;
  subtitle: string;
  type: "subject" | "topic" | "case";
};

export type SubjectSummaryAutocompleteResponse = {
  items: SubjectSummaryAutocompleteResult[];
};

export type SubjectSummaryReadingInsight = {
  id: string;
  kind: "case" | "subject" | "topic";
  label: string;
  reads: number;
};

export type SubjectSummaryReadingInsightsResponse = {
  items: SubjectSummaryReadingInsight[];
  totalReads: number;
};

export type SubjectSummaryModuleDifficulty = "EASY" | "INTERMEDIATE" | "ADVANCED";

export type SubjectSummaryModuleRelatedCase = {
  citation: string;
  court: string;
  id: string;
  path: string;
  ratioDecidendi: string;
  title: string;
  topic: {
    id: string;
    name: string;
  };
};

export type SubjectSummaryModuleType = "FACULTY" | "NLS";

export type SubjectSummaryModuleEntry = {
  answer: string;
  createdAt: string;
  createdBy: string | null;
  difficulty: SubjectSummaryModuleDifficulty;
  displayOrder: number;
  estimatedReadingTime: number;
  examTip: string;
  id: string;
  keyPrinciple: string;
  moduleType: SubjectSummaryModuleType;
  serialNumber: string;
  topic: string;
  question: string;
  relatedCases: SubjectSummaryModuleRelatedCase[];
  reviewFeedback: string;
  relatedStatutes: string[];
  status: SubjectSummaryCaseStatus;
  subject: {
    id: string;
    name: string;
  };
  subjectId: string;
  tags: string[];
  updatedAt: string;
};

export type SubjectSummaryModuleEntryInput = {
  answer: string;
  difficulty: SubjectSummaryModuleDifficulty;
  displayOrder: number;
  estimatedReadingTime: number;
  examTip: string;
  keyPrinciple: string;
  moduleType: SubjectSummaryModuleType;
  topic: string;
  question: string;
  relatedCaseIds: string[];
  relatedStatutes: string[];
  status: SubjectSummaryCaseStatus;
  subjectId: string;
  tags: string[];
};

export type SubjectSummaryModuleTopicBulkEntryInput = {
  answer: string;
  difficulty: SubjectSummaryModuleDifficulty;
  estimatedReadingTime: number;
  examTip: string;
  keyPrinciple: string;
  question: string;
  relatedCaseIds: string[];
  relatedStatutes: string[];
  tags: string[];
};

export type SubjectSummaryModuleTopicBulkInput = {
  entries: SubjectSummaryModuleTopicBulkEntryInput[];
  moduleType: SubjectSummaryModuleType;
  status: SubjectSummaryCaseStatus;
  subjectId: string;
  topic: string;
};

export type SubjectSummaryModuleAdminTopic = {
  archivedCount: number;
  draftCount: number;
  lastUpdated: string;
  pendingApprovalCount: number;
  publishedCount: number;
  questionCount: number;
  topic: string;
};

export type SubjectSummaryModuleAdminTopicsResponse = {
  items: SubjectSummaryModuleAdminTopic[];
};

export type SubjectSummaryModuleStudentTopic = {
  lastUpdated: string;
  questionCount: number;
  topic: string;
};

export type SubjectSummaryModuleStudentTopicsResponse = {
  items: SubjectSummaryModuleStudentTopic[];
};

export type SubjectSummaryModuleAdminEntry = SubjectSummaryModuleEntry;

export type SubjectSummaryModuleAdminEntryList = {
  items: SubjectSummaryModuleAdminEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    archivedCount: number;
    draftCount: number;
    publishedCount: number;
    totalEntries: number;
  };
};

export type SubjectSummaryModuleFormOptions = {
  relatedCases: Array<{
    citation: string;
    id: string;
    subjectId: string;
    title: string;
    topic: {
      id: string;
      name: string;
    };
  }>;
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type SubjectSummaryModuleStudentSubject = {
  completionPct: number;
  completedCount: number;
  estimatedReadingTime: number;
  id: string;
  lastOpenedAt: string | null;
  lastUpdated: string;
  name: string;
  questionCount: number;
};

export type SubjectSummaryModuleStudentSubjectsResponse = {
  items: SubjectSummaryModuleStudentSubject[];
};

export type SubjectSummaryModuleStudentEntry = SubjectSummaryModuleEntry & {
  bookmarked: boolean;
  noteCount: number;
  notePreview: string;
  orderLabel: number;
  progress: {
    completed: boolean;
    lastOpenedAt: string | null;
    readingProgressPct: number;
    timeSpentSeconds: number;
  };
};

export type SubjectSummaryModuleStudentRevisionResponse = {
  contentAccess: PremiumContentAccess;
  entries: SubjectSummaryModuleStudentEntry[];
  stats: {
    averageReadingTime: number;
    bookmarks: number;
    completed: number;
    completionPct: number;
    continueReadingEntryId: string | null;
    lastReadAt: string | null;
    notesCreated: number;
    questionsRemaining: number;
    questionsTotal: number;
    studyStreak: number;
    totalReadingTimeSeconds: number;
    weeklyProgressPct: number;
  };
  subject: {
    estimatedReadingTime: number;
    id: string;
    lastUpdated: string | null;
    name: string;
  };
};

export type BarFinalExamQuestionStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "ARCHIVED";

export type BarFinalExamQuestion = {
  answer: string;
  createdAt: string;
  examDate: string | null;
  id: string;
  question: string;
  status: BarFinalExamQuestionStatus;
  subject: {
    id: string;
    name: string;
  };
  subjectId: string;
  updatedAt: string;
};

export type BarFinalExamQuestionInput = {
  answer: string;
  examDate: string;
  question: string;
  status: BarFinalExamQuestionStatus;
  subjectId: string;
};

export type AdminBarFinalExamQuestionList = {
  items: BarFinalExamQuestion[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type BarFinalExamMcqQuestion = {
  correctOptionIndex: number;
  createdAt: string;
  examDate: string | null;
  id: string;
  options: string[];
  question: string;
  status: BarFinalExamQuestionStatus;
  subject: {
    id: string;
    name: string;
  };
  subjectId: string;
  updatedAt: string;
};

export type BarFinalExamMcqQuestionInput = {
  correctOptionIndex: number;
  examDate: string;
  options: string[];
  question: string;
  status: BarFinalExamQuestionStatus;
  subjectId: string;
};

export type AdminBarFinalExamMcqQuestionList = {
  items: BarFinalExamMcqQuestion[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type StudentBarFinalExamMcqSubjectsResponse = {
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type StudentBarFinalExamMcqQuestionsResponse = {
  items: Array<{
    examDate: string | null;
    id: string;
    options: string[];
    question: string;
  }>;
};

export type StudentBarFinalExamMcqAttemptInput = {
  selectedOptionIndex: number;
};

export type StudentBarFinalExamMcqAttemptResponse = {
  correctOptionIndex: number;
  id: string;
  isCorrect: boolean;
  selectedOptionIndex: number;
};

export type BarFinalExamFormOptions = {
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type StudentBarFinalExamSubjectsResponse = {
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

export type StudentBarFinalExamQuestionsResponse = {
  items: Array<{
    answer: string;
    examDate: string | null;
    id: string;
    question: string;
  }>;
};

export type StudyContentType =
  | "LAW_REPORT"
  | "SUBJECT_SUMMARY_SUBJECT"
  | "SUBJECT_SUMMARY_TOPIC"
  | "SUBJECT_SUMMARY_CASE"
  | "SUBJECT_SUMMARY_ENTRY"
  | "STATUTE"
  | "REVISION_MATERIAL";

export type StudentStudyProgress = {
  completed: boolean;
  contentKey: string;
  contentType: StudyContentType;
  createdAt: string;
  id: string;
  lastOpenedAt: string;
  lastPositionLabel: string | null;
  path: string;
  readingProgressPct: number;
  scrollProgressPct: number;
  subjectName: string | null;
  timeSpentSeconds: number;
  title: string;
  topicName: string | null;
  updatedAt: string;
};

export type StudentStudyBookmark = {
  contentKey: string;
  contentType: StudyContentType;
  createdAt: string;
  id: string;
  note: string | null;
  path: string;
  subjectName: string | null;
  title: string;
  topicName: string | null;
  updatedAt: string;
};

export type StudentStudyNote = {
  attachmentUrls: string[];
  contentHtml: string;
  contentKey: string | null;
  contentPlainText: string;
  contentType: StudyContentType | null;
  createdAt: string;
  id: string;
  isDraft: boolean;
  isFavorite: boolean;
  path: string | null;
  referenceTitle: string | null;
  subjectName: string | null;
  title: string;
  topicName: string | null;
  updatedAt: string;
};

export type StudentStudyDownload = {
  contentKey: string;
  contentType: StudyContentType;
  createdAt: string;
  fileName: string;
  id: string;
  path: string;
  subjectName: string | null;
  title: string;
  topicName: string | null;
  updatedAt: string;
};

export type StudentStudyCenterDashboard = {
  achievements: Array<{
    description: string;
    label: string;
    tone: "amber" | "blue" | "emerald";
  }>;
  bookmarks: {
    items: StudentStudyBookmark[];
    total: number;
  };
  continueReading: StudentStudyProgress | null;
  downloads: {
    items: StudentStudyDownload[];
    total: number;
  };
  frequency: {
    averageStudySessionsPerWeek: number;
    dailyActivity: Array<{
      date: string;
      label: string;
      seconds: number;
      sessionCount: number;
    }>;
    daysStudiedThisMonth: number;
    daysStudiedThisWeek: number;
    mostActiveStudyDay: string;
    streakDays: number;
  };
  lastStudiedTopic: {
    lastOpenedAt: string;
    path: string;
    progressPct: number;
    subjectName: string | null;
    title: string;
    topicName: string | null;
  } | null;
  progress: {
    completedItems: number;
    inProgressItems: number;
    totalTrackedItems: number;
  };
  readingDuration: {
    monthlySeconds: number;
    todaySeconds: number;
    totalSeconds: number;
    weeklySeconds: number;
  };
  recentlyOpened: StudentStudyProgress[];
  recentlyViewedCases: StudentStudyProgress[];
  timeline: Array<{
    contentType: StudyContentType;
    durationSeconds: number;
    id: string;
    lastOpenedAt: string;
    lastPositionLabel: string | null;
    path: string;
    progressPct: number;
    status: string;
    title: string;
  }>;
  unifiedSearchPlaceholder: string;
};

export type StudentStudyCenterSearchResult = {
  id: string;
  kind: "bookmark" | "download" | "history" | "note";
  label: string;
  meta: string;
  path: string;
};

export type SubjectSummaryBulkActionResult = {
  success: true;
};

export type AdminUserListFilters = {
  page?: number;
  pageSize?: number;
  registeredFrom?: string;
  registeredTo?: string;
  role?: string;
  search?: string;
  sortBy?: "createdAt" | "fullName" | "email" | "status";
  sortOrder?: "asc" | "desc";
  status?: "all" | "ACTIVE" | "PENDING" | "SUSPENDED";
};

export type AdminRoleBreakdown = {
  code: string;
  count: number;
  name: string;
};

export type AdminUserSummary = {
  city: string | null;
  contributionCount: number;
  country: string | null;
  createdAt: string;
  deviceCount: number;
  email: string;
  emailVerifiedAt: string | null;
  fullName: string;
  id: string;
  lastActiveAt: string;
  latestPaymentAmount: string | null;
  latestPaymentStatus: string | null;
  paymentCount: number;
  phoneNumber: string | null;
  primaryRole: string;
  roles: Array<{
    code: string;
    name: string;
  }>;
  sessionCount: number;
  state: string | null;
  status: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  twoFactorEnabled: boolean;
};

export type AdminUserDetail = {
  address: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    country: string | null;
    postalCode: string | null;
    state: string | null;
  };
  avatarUrl: string | null;
  counts: {
    answers: number;
    certificates: number;
    comments: number;
    devices: number;
    notifications: number;
    payments: number;
    replies: number;
    sessions: number;
    subscriptions: number;
    topics: number;
  };
  createdAt: string;
  deviceLimit: number;
  deviceLimitOverride: number | null;
  devices: Array<{
    createdAt: string;
    id: string;
    lastSeenAt: string | null;
    name: string;
  }>;
  email: string;
  emailVerifiedAt: string | null;
  fullName: string;
  id: string;
  lastActiveAt: string;
  payments: Array<{
    amount: string;
    createdAt: string;
    id: string;
    provider: string;
    status: string;
  }>;
  phoneNumber: string | null;
  profileType: string;
  recentActivity: Array<{
    action: string;
    context: unknown;
    createdAt: string;
    id: string;
    kind: "activity" | "audit";
  }>;
  roles: Array<{
    code: string;
    description?: string | null;
    name: string;
  }>;
  sessions: Array<{
    createdAt: string;
    expiresAt: string;
    id: string;
    updatedAt: string;
  }>;
  status: string;
  studentProfile: {
    headline: string | null;
    id: string;
    streakDays: number;
    studyHours: number;
  } | null;
  subscriptions: Array<{
    autoRenew: boolean;
    createdAt: string;
    endsAt: string | null;
    id: string;
    plan: {
      code: string;
      interval: string;
      name: string;
      price: string;
    };
    recentPayments: Array<{
      amount: string;
      createdAt: string;
      id: string;
      provider: string;
      status: string;
    }>;
    startsAt: string;
    status: string;
  }>;
  tutorProfile: {
    bio: string | null;
    id: string;
    rating: number;
    specialty: string | null;
  } | null;
  twoFactorEnabled: boolean;
  updatedAt: string;
};

export type AdminUsersSnapshot = {
  appliedFilters: Required<AdminUserListFilters>;
  availableRoles: Array<{
    code: string;
    name: string;
  }>;
  globalSummary: {
    totalUsers: number;
  };
  metrics: DashboardMetric[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  registrationTimeline: Array<{
    count: number;
    date: string;
    label: string;
  }>;
  roleBreakdown: AdminRoleBreakdown[];
  summary: {
    activeUsers: number;
    pendingUsers: number;
    registrationsInWindow: number;
    suspendedUsers: number;
    totalUsers: number;
    verifiedUsers: number;
  };
  users: AdminUserSummary[];
};

export type AdminUserStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type AdminUserProfileInput = {
  fullName: string;
  email: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type AdminCreateUserInput = {
  fullName: string;
  email: string;
  password: string;
  roleCodes: string[];
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type AdminUserPasswordInput = {
  password: string;
};

export type AdminUserDeviceLimitInput = {
  deviceLimitOverride: number | null;
};

export type AdminMonthlyRegistrations = {
  availableYears: number[];
  year: number;
  totalRegistrations: number;
  months: Array<{
    month: number;
    label: string;
    count: number;
  }>;
};

export type AdminDashboardOverview = {
  alerts: Array<{
    body: string;
    title: string;
    tone: "amber" | "blue" | "green" | "red";
  }>;
  charts: {
    contentDistribution: Array<{
      label: string;
      percent: number;
      value: number;
    }>;
    engagementBreakdown: Array<{
      label: string;
      value: number;
    }>;
    financeTrend: Array<{
      collectedAmountMinor: number;
      failedCount: number;
      label: string;
    }>;
    studyActivityByType: Array<{
      label: string;
      value: number;
    }>;
    subscriptionStatus: Array<{
      label: string;
      value: number;
    }>;
    userGrowth: Array<{
      label: string;
      registrations: number;
    }>;
    userStatus: Array<{
      label: string;
      value: number;
    }>;
  };
  communityOverview: {
    activeDiscussions: number;
    health: Array<{
      label: string;
      status: "healthy" | "warning" | "critical";
      value: string;
    }>;
    mostActiveMembers: Array<{
      label: string;
      value: number;
    }>;
    reportedPosts: number;
    totalComments: number;
    totalPosts: number;
  };
  contentOverview: {
    archived: {
      cases: number;
      subjectSummaries: number;
    };
    cases: number;
    downloads: number;
    draft: {
      cases: number;
      subjectSummaries: number;
    };
    published: {
      announcements: number;
      cases: number;
      subjectSummaries: number;
    };
    ratios: number;
    statutes: number;
    studyMaterials: number;
    subjectSummaries: number;
    subjects: number;
    videos: number;
  };
  cbt: {
    averageStudentScore: number;
    dailyActivity: Array<{
      label: string;
      value: number;
    }>;
    examsTakenToday: number;
    failRate: number;
    highestScore: number;
    lowestScore: number;
    passFailRatio: Array<{
      label: string;
      value: number;
    }>;
    passRate: number;
    pendingExams: number;
    scoreDistribution: Array<{
      label: string;
      value: number;
    }>;
    totalExamsCreated: number;
  };
  executiveStats: Array<{
    comparisonLabel: string;
    direction: "down" | "neutral" | "up";
    formattedTotal?: string;
    icon: string;
    label: string;
    percentage: number;
    total: number;
  }>;
  header: {
    messagesCount: number;
    notificationsCount: number;
    quickActionsCount: number;
  };
  hero: {
    activeUsers: number;
    connectContributors: number;
    studyHours: number;
    totalContentItems: number;
    totalUsers: number;
  };
  leaderboard: Array<{
    averageExamScore: number;
    communityContributions: number;
    compositeScore: number;
    id: string;
    name: string;
    readingCompletionPct: number;
    studyHours: number;
  }>;
  learningAnalytics: {
    averageReadingTimeMinutes: number;
    averageStudyDurationMinutes: number;
    highestPerformingSubjects: Array<{
      label: string;
      value: number;
    }>;
    lowestPerformingSubjects: Array<{
      label: string;
      value: number;
    }>;
    mostAttemptedExams: Array<{
      label: string;
      value: number;
    }>;
    mostBookmarkedTopics: Array<{
      label: string;
      value: number;
    }>;
    mostReadSubjectSummaries: Array<{
      label: string;
      value: number;
    }>;
    mostStudiedSubjects: Array<{
      label: string;
      value: number;
    }>;
    mostViewedCases: Array<{
      label: string;
      value: number;
    }>;
  };
  loginActivity: {
    currentlyOnline: number;
    loginTrend: Array<{
      label: string;
      value: number;
    }>;
    monthlyActiveUsers: number;
    todayLogins: number;
    weeklyActiveUsers: number;
  };
  modules: {
    connect: {
      answers: number;
      comments: number;
      contributors: number;
      questions: number;
      unansweredQuestions: number;
      votes: number;
    };
    content: {
      caseSubjects: number;
      caseTopics: number;
      casesDraft: number;
      casesPublished: number;
      libraryCasesAndRatios: number;
      libraryLawReports: number;
      librarySubjectSummaries: number;
      summaryEntriesDraft: number;
      summaryEntriesPublished: number;
    };
    finance: {
      activeSubscriptions: number;
      failedPayments: number;
      pendingPayments: number;
      revenueCollected: string;
      totalSubscriptions: number;
    };
    studyCenter: {
      bookmarks: number;
      downloads: number;
      notes: number;
      readingHours: number;
      trackedProgressItems: number;
    };
    users: {
      activeLast30Days: number;
      admins: number;
      pending: number;
      students: number;
      suspended: number;
      total: number;
    };
  };
  pendingTasks: Array<{
    detail: string;
    level: "healthy" | "warning" | "critical";
    title: string;
  }>;
  recentActivity: Array<{
    detail: string;
    timestamp: string;
    title: string;
    type: string;
  }>;
  recentRegistrations: Array<{
    email: string;
    id: string;
    lastLoginAt: string | null;
    name: string;
    registeredAt: string;
    role: string;
    status: string;
  }>;
  security: {
    activeSessions: number;
    devicesLoggedIn: number;
    failedLoginAttempts: number;
    lockedAccounts: number;
    passwordResetRequests: number;
    suspiciousActivities: number;
  };
  studentGrowth: {
    daily: Array<{
      label: string;
      value: number;
    }>;
    monthly: Array<{
      label: string;
      value: number;
    }>;
    weekly: Array<{
      label: string;
      value: number;
    }>;
    yearly: Array<{
      label: string;
      value: number;
    }>;
  };
  summaryCards: Array<{
    changeLabel: string;
    label: string;
    value: string;
  }>;
  systemHealth: Array<{
    label: string;
    status: "healthy" | "warning" | "critical";
    value: string;
  }>;
};

function createQueryParams(filters: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

export async function fetchAdminUsers(filters: AdminUserListFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminUsersSnapshot }>("/api/v1/admin/users", {
    params: Object.fromEntries(createQueryParams(filters).entries())
  });

  return response.data.data;
}

export async function fetchSubjectSummaryHierarchy(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyResponse }>(
    "/api/v1/admin/subject-summaries/hierarchy",
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function fetchPublishedSubjectSummaryHierarchy(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyResponse }>(
    "/api/v1/library/subject-summaries/hierarchy",
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryHierarchyTopics(subjectId: string, search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyTopicResponse }>(
    `/api/v1/admin/subject-summaries/hierarchy/subjects/${subjectId}/topics`,
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function fetchPublishedSubjectSummaryHierarchyTopics(subjectId: string, search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyTopicResponse }>(
    `/api/v1/library/subject-summaries/hierarchy/subjects/${subjectId}/topics`,
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryHierarchyCases(topicId: string, search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyCaseResponse }>(
    `/api/v1/admin/subject-summaries/hierarchy/topics/${topicId}/cases`,
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function fetchPublishedSubjectSummaryHierarchyCases(topicId: string, search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryHierarchyCaseResponse }>(
    `/api/v1/library/subject-summaries/hierarchy/topics/${topicId}/cases`,
    {
      params: Object.fromEntries(createQueryParams({ search }).entries())
    }
  );

  return response.data.data;
}

export async function autocompleteSubjectSummaries(query: string, limit = 8) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryAutocompleteResponse }>(
    "/api/v1/admin/subject-summaries/autocomplete",
    {
      params: { limit, query }
    }
  );

  return response.data.data;
}

export async function autocompletePublishedSubjectSummaries(query: string, limit = 8) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryAutocompleteResponse }>(
    "/api/v1/library/subject-summaries/autocomplete",
    {
      params: { limit, query }
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummarySubjects(filters: SubjectSummarySubjectFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummarySubjectList }>(
    "/api/v1/admin/subject-summaries/subjects",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function createSubjectSummarySubject(payload: SubjectSummarySubjectInput) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummarySubject }>(
    "/api/v1/admin/subject-summaries/subjects",
    payload
  );

  return response.data.data;
}

export async function updateSubjectSummarySubject(subjectId: string, payload: SubjectSummarySubjectInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: SubjectSummarySubject }>(
    `/api/v1/admin/subject-summaries/subjects/${subjectId}`,
    payload
  );

  return response.data.data;
}

export async function deleteSubjectSummarySubject(subjectId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/subject-summaries/subjects/${subjectId}`
  );

  return response.data.data;
}

export async function bulkUpdateSubjectSummarySubjects(action: "activate" | "archive" | "deactivate" | "delete", ids: string[]) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryBulkActionResult }>(
    "/api/v1/admin/subject-summaries/subjects/bulk",
    { action, ids }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryTopics(filters: SubjectSummaryTopicFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryTopicList }>(
    "/api/v1/admin/subject-summaries/topics",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function createSubjectSummaryTopic(payload: SubjectSummaryTopicInput) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryTopic }>(
    "/api/v1/admin/subject-summaries/topics",
    payload
  );

  return response.data.data;
}

export async function updateSubjectSummaryTopic(topicId: string, payload: SubjectSummaryTopicInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: SubjectSummaryTopic }>(
    `/api/v1/admin/subject-summaries/topics/${topicId}`,
    payload
  );

  return response.data.data;
}

export async function deleteSubjectSummaryTopic(topicId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/subject-summaries/topics/${topicId}`
  );

  return response.data.data;
}

export async function bulkUpdateSubjectSummaryTopics(action: "activate" | "archive" | "deactivate" | "delete", ids: string[]) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryBulkActionResult }>(
    "/api/v1/admin/subject-summaries/topics/bulk",
    { action, ids }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryCases(filters: SubjectSummaryCaseFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryCaseList }>(
    "/api/v1/admin/subject-summaries/cases",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryReadingInsights() {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryReadingInsightsResponse }>(
    "/api/v1/admin/subject-summaries/reading-insights"
  );

  return response.data.data;
}

export async function fetchSubjectSummaryCaseDetail(caseId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryCase }>(
    `/api/v1/admin/subject-summaries/cases/${caseId}`
  );

  return response.data.data;
}

export async function createSubjectSummaryCase(payload: SubjectSummaryCaseInput) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryCase }>(
    "/api/v1/admin/subject-summaries/cases",
    payload
  );

  return response.data.data;
}

export async function updateSubjectSummaryCase(caseId: string, payload: SubjectSummaryCaseInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: SubjectSummaryCase }>(
    `/api/v1/admin/subject-summaries/cases/${caseId}`,
    payload
  );

  return response.data.data;
}

export async function deleteSubjectSummaryCase(caseId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/subject-summaries/cases/${caseId}`
  );

  return response.data.data;
}

export async function bulkUpdateSubjectSummaryCases(action: "archive" | "delete" | "draft" | "publish", ids: string[]) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryBulkActionResult }>(
    "/api/v1/admin/subject-summaries/cases/bulk",
    { action, ids }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryModuleAdminEntries(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "createdAt" | "displayOrder" | "question" | "updatedAt";
  sortOrder?: "asc" | "desc";
  status?: "all" | SubjectSummaryCaseStatus;
  subjectId?: string;
  moduleType?: SubjectSummaryModuleType;
  topic?: string;
}) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleAdminEntryList }>(
    "/api/v1/admin/subject-summary-module/entries",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryModuleFormOptions(subjectId = "") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleFormOptions }>(
    "/api/v1/admin/subject-summary-module/form-options",
    {
      params: subjectId ? { subjectId } : {}
    }
  );

  return response.data.data;
}

export async function fetchSubjectSummaryModuleAdminTopics(params: {
  moduleType: SubjectSummaryModuleType;
  status?: "all" | SubjectSummaryCaseStatus;
  subjectId: string;
}) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleAdminTopicsResponse }>(
    "/api/v1/admin/subject-summary-module/topics",
    {
      params
    }
  );

  return response.data.data;
}

export async function createSubjectSummaryModuleEntry(payload: SubjectSummaryModuleEntryInput) {
  const response = await authenticatedHttp.post<{ success: true; data: SubjectSummaryModuleAdminEntry }>(
    "/api/v1/admin/subject-summary-module/entries",
    payload
  );

  return response.data.data;
}

export async function createSubjectSummaryModuleTopicEntries(payload: SubjectSummaryModuleTopicBulkInput) {
  const response = await authenticatedHttp.post<{ success: true; data: { createdCount: number } }>(
    "/api/v1/admin/subject-summary-module/topics",
    payload
  );

  return response.data.data;
}

export async function updateSubjectSummaryModuleEntry(entryId: string, payload: SubjectSummaryModuleEntryInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: SubjectSummaryModuleAdminEntry }>(
    `/api/v1/admin/subject-summary-module/entries/${entryId}`,
    payload
  );

  return response.data.data;
}

export async function deleteSubjectSummaryModuleEntry(entryId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/subject-summary-module/entries/${entryId}`
  );

  return response.data.data;
}

export async function fetchStudentSubjectSummaryModuleSubjects(search = "", moduleType: SubjectSummaryModuleType = "FACULTY") {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleStudentSubjectsResponse }>(
    "/api/v1/library/subject-summary-module/subjects",
    {
      params: { search, moduleType }
    }
  );

  return response.data.data;
}

export async function fetchStudentSubjectSummaryModuleTopics(params: { moduleType: SubjectSummaryModuleType; subjectId: string }) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleStudentTopicsResponse }>(
    "/api/v1/library/subject-summary-module/topics",
    {
      params
    }
  );

  return response.data.data;
}

export async function fetchStudentSubjectSummaryModuleEntries(params: {
  filter?: "all" | "bookmarked" | "difficult" | "easy" | "read" | "recentlyViewed" | "unread";
  query?: string;
  subjectId: string;
  moduleType?: SubjectSummaryModuleType;
  topic?: string;
}) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryModuleStudentRevisionResponse }>(
    "/api/v1/library/subject-summary-module/entries",
    {
      params
    }
  );

  return response.data.data;
}

export async function fetchAdminBarFinalExamQuestions(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | BarFinalExamQuestionStatus;
  subjectId?: string;
}) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminBarFinalExamQuestionList }>(
    "/api/v1/admin/bar-final-exams-nls-mcq/questions",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function fetchBarFinalExamFormOptions() {
  const response = await authenticatedHttp.get<{ success: true; data: BarFinalExamFormOptions }>(
    "/api/v1/admin/bar-final-exams-nls-mcq/form-options"
  );

  return response.data.data;
}

export async function createAdminBarFinalExamQuestion(payload: BarFinalExamQuestionInput) {
  const response = await authenticatedHttp.post<{ success: true; data: BarFinalExamQuestion }>(
    "/api/v1/admin/bar-final-exams-nls-mcq/questions",
    payload
  );

  return response.data.data;
}

export async function updateAdminBarFinalExamQuestion(questionId: string, payload: BarFinalExamQuestionInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: BarFinalExamQuestion }>(
    `/api/v1/admin/bar-final-exams-nls-mcq/questions/${questionId}`,
    payload
  );

  return response.data.data;
}

export async function deleteAdminBarFinalExamQuestion(questionId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/bar-final-exams-nls-mcq/questions/${questionId}`
  );

  return response.data.data;
}

export async function fetchAdminBarFinalExamMcqQuestions(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | BarFinalExamQuestionStatus;
  subjectId?: string;
}) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminBarFinalExamMcqQuestionList }>(
    "/api/v1/admin/bar-final-exams-mcq/questions",
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function fetchBarFinalExamMcqFormOptions() {
  const response = await authenticatedHttp.get<{ success: true; data: BarFinalExamFormOptions }>(
    "/api/v1/admin/bar-final-exams-mcq/form-options"
  );

  return response.data.data;
}

export async function createAdminBarFinalExamMcqQuestion(payload: BarFinalExamMcqQuestionInput) {
  const response = await authenticatedHttp.post<{ success: true; data: BarFinalExamMcqQuestion }>(
    "/api/v1/admin/bar-final-exams-mcq/questions",
    payload
  );

  return response.data.data;
}

export async function updateAdminBarFinalExamMcqQuestion(questionId: string, payload: BarFinalExamMcqQuestionInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: BarFinalExamMcqQuestion }>(
    `/api/v1/admin/bar-final-exams-mcq/questions/${questionId}`,
    payload
  );

  return response.data.data;
}

export async function deleteAdminBarFinalExamMcqQuestion(questionId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/bar-final-exams-mcq/questions/${questionId}`
  );

  return response.data.data;
}

export async function fetchStudentBarFinalExamSubjects(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: StudentBarFinalExamSubjectsResponse }>(
    "/api/v1/library/bar-final-exams-nls-mcq/subjects",
    {
      params: { search }
    }
  );

  return response.data.data;
}

export async function fetchStudentBarFinalExamQuestions(subjectId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: StudentBarFinalExamQuestionsResponse }>(
    "/api/v1/library/bar-final-exams-nls-mcq/questions",
    {
      params: { subjectId }
    }
  );

  return response.data.data;
}

export async function fetchStudentBarFinalExamMcqSubjects(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: StudentBarFinalExamMcqSubjectsResponse }>(
    "/api/v1/library/bar-final-exams-mcq/subjects",
    {
      params: { search }
    }
  );

  return response.data.data;
}

export async function fetchStudentBarFinalExamMcqQuestions(subjectId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: StudentBarFinalExamMcqQuestionsResponse }>(
    "/api/v1/library/bar-final-exams-mcq/questions",
    {
      params: { subjectId }
    }
  );

  return response.data.data;
}

export async function submitStudentBarFinalExamMcqAttempt(questionId: string, payload: StudentBarFinalExamMcqAttemptInput) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentBarFinalExamMcqAttemptResponse }>(
    `/api/v1/library/bar-final-exams-mcq/questions/${questionId}/attempt`,
    payload
  );

  return response.data.data;
}

export async function fetchAdminLibraryMaterials(section: AdminLibrarySection, filters: AdminLibraryFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibrarySnapshot }>(
    `/api/v1/admin/library/${section}/materials`,
    {
      params: Object.fromEntries(createQueryParams(filters).entries())
    }
  );

  return response.data.data;
}

export async function createAdminLibraryMaterial(section: AdminLibrarySection, payload: AdminLibraryMaterialInput) {
  const response = await authenticatedHttp.post<{ success: true; data: AdminLibraryMaterial }>(
    `/api/v1/admin/library/${section}/materials`,
    payload
  );

  return response.data.data;
}

export async function fetchAdminLibraryMaterial(section: AdminLibrarySection, materialId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibraryMaterialDetail }>(
    `/api/v1/admin/library/${section}/materials/${materialId}`
  );

  return response.data.data;
}

export async function fetchLibraryMaterial(section: "law-reports", materialId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibraryMaterialDetail }>(
    `/api/v1/library/${section}/${materialId}`
  );

  return response.data.data;
}

export async function fetchLibraryLawReports(filters: AdminLibraryFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibrarySnapshot }>("/api/v1/library/law-reports", {
    params: Object.fromEntries(createQueryParams(filters).entries())
  });

  return response.data.data;
}

export async function createLawReportReadingSession(materialId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string } }>(
    `/api/v1/library/law-reports/${materialId}/reading-sessions`
  );

  return response.data.data;
}

export async function updateLawReportReadingSession(
  sessionId: string,
  payload: {
    progressPct?: number;
    timeSpentSeconds?: number;
  }
) {
  const response = await authenticatedHttp.patch<{ success: true; data: { id: string } }>(
    `/api/v1/library/law-reports/reading-sessions/${sessionId}`,
    payload
  );

  return response.data.data;
}

export async function fetchPublishedSubjectSummaryCaseDetail(caseId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: SubjectSummaryCase }>(
    `/api/v1/library/subject-summaries/cases/${caseId}`
  );

  return response.data.data;
}

export async function fetchStudentStudyCenterDashboard() {
  const response = await authenticatedHttp.get<{ success: true; data: StudentStudyCenterDashboard }>(
    "/api/v1/student/study-center/dashboard"
  );

  return response.data.data;
}

export async function fetchStudentStudyProgress(contentKey: string) {
  const response = await authenticatedHttp.get<{ success: true; data: StudentStudyProgress | null }>(
    "/api/v1/student/study-center/progress",
    {
      params: { contentKey }
    }
  );

  return response.data.data;
}

export async function saveStudentStudyProgress(payload: {
  completed?: boolean;
  contentKey: string;
  contentType: StudyContentType;
  lastPositionLabel?: string;
  path: string;
  readingProgressPct?: number;
  scrollProgressPct?: number;
  subjectName?: string;
  timeSpentSeconds?: number;
  title: string;
  topicName?: string;
}) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentStudyProgress }>(
    "/api/v1/student/study-center/progress",
    payload
  );

  return response.data.data;
}

export async function fetchStudentStudyBookmarks(params?: {
  contentType?: StudyContentType;
  search?: string;
  sortBy?: "date" | "subject" | "title" | "topic";
}) {
  const response = await authenticatedHttp.get<{ success: true; data: { items: StudentStudyBookmark[] } }>(
    "/api/v1/student/study-center/bookmarks",
    {
      params
    }
  );

  return response.data.data;
}

export async function createStudentStudyBookmark(payload: {
  contentKey: string;
  contentType: StudyContentType;
  note?: string;
  path: string;
  subjectName?: string;
  title: string;
  topicName?: string;
}) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentStudyBookmark }>(
    "/api/v1/student/study-center/bookmarks",
    payload
  );

  return response.data.data;
}

export async function deleteStudentStudyBookmark(bookmarkId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { success: true } }>(
    `/api/v1/student/study-center/bookmarks/${bookmarkId}`
  );

  return response.data.data;
}

export async function fetchStudentStudyNotes(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: { items: StudentStudyNote[] } }>(
    "/api/v1/student/study-center/notes",
    {
      params: { search }
    }
  );

  return response.data.data;
}

export async function createStudentStudyNote(payload: {
  attachmentUrls: string[];
  contentHtml: string;
  contentKey?: string;
  contentPlainText: string;
  contentType?: StudyContentType;
  isDraft?: boolean;
  isFavorite?: boolean;
  path?: string;
  referenceTitle?: string;
  subjectName?: string;
  title: string;
  topicName?: string;
}) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentStudyNote }>(
    "/api/v1/student/study-center/notes",
    payload
  );

  return response.data.data;
}

export async function updateStudentStudyNote(
  noteId: string,
  payload: {
    attachmentUrls: string[];
    contentHtml: string;
    contentKey?: string;
    contentPlainText: string;
    contentType?: StudyContentType;
    isDraft?: boolean;
    isFavorite?: boolean;
    path?: string;
    referenceTitle?: string;
    subjectName?: string;
    title: string;
    topicName?: string;
  }
) {
  const response = await authenticatedHttp.patch<{ success: true; data: StudentStudyNote }>(
    `/api/v1/student/study-center/notes/${noteId}`,
    payload
  );

  return response.data.data;
}

export async function deleteStudentStudyNote(noteId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { success: true } }>(
    `/api/v1/student/study-center/notes/${noteId}`
  );

  return response.data.data;
}

export async function fetchStudentStudyDownloads(search = "") {
  const response = await authenticatedHttp.get<{ success: true; data: { items: StudentStudyDownload[] } }>(
    "/api/v1/student/study-center/downloads",
    {
      params: { search }
    }
  );

  return response.data.data;
}

export async function recordStudentStudyDownload(payload: {
  contentKey: string;
  contentType: StudyContentType;
  fileName: string;
  path: string;
  subjectName?: string;
  title: string;
  topicName?: string;
}) {
  const response = await authenticatedHttp.post<{ success: true; data: StudentStudyDownload }>(
    "/api/v1/student/study-center/downloads",
    payload
  );

  return response.data.data;
}

export async function searchStudentStudyCenter(query: string) {
  const response = await authenticatedHttp.get<{ success: true; data: { items: StudentStudyCenterSearchResult[] } }>(
    "/api/v1/student/study-center/search",
    {
      params: { query }
    }
  );

  return response.data.data;
}

export async function searchAdminLibrary(query: string, limit = 12) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibrarySearchResult[] }>(
    "/api/v1/admin/library/search",
    {
      params: {
        limit,
        query
      }
    }
  );

  return response.data.data;
}

export async function searchAdminPortal(query: string, limit = 5) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminPortalSearchResponse }>("/api/v1/admin/search", {
    params: {
      limit,
      query
    }
  });

  return response.data.data;
}

export async function searchLibrary(query: string, limit = 12) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminLibrarySearchResult[] }>("/api/v1/library/search", {
    params: {
      limit,
      query
    }
  });

  return response.data.data;
}

export async function updateAdminLibraryMaterial(
  section: AdminLibrarySection,
  materialId: string,
  payload: AdminLibraryMaterialInput
) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminLibraryMaterial }>(
    `/api/v1/admin/library/${section}/materials/${materialId}`,
    payload
  );

  return response.data.data;
}

export async function deleteAdminLibraryMaterial(section: AdminLibrarySection, materialId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/library/${section}/materials/${materialId}`
  );

  return response.data.data;
}

export async function fetchAdminUsersForExport(filters: AdminUserListFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminUsersSnapshot }>("/api/v1/admin/users", {
    params: Object.fromEntries(
      createQueryParams({
        ...filters,
        page: 1,
        pageSize: 10000
      }).entries()
    )
  });

  return response.data.data.users;
}

export async function fetchAdminMonthlyRegistrations(year: number) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminMonthlyRegistrations }>(
    "/api/v1/admin/users/analytics/monthly-registrations",
    {
      params: { year }
    }
  );

  return response.data.data;
}

export async function fetchAdminDashboardOverview() {
  const response = await authenticatedHttp.get<{ success: true; data: AdminDashboardOverview }>("/api/v1/admin/dashboard/overview");

  return response.data.data;
}

export async function fetchAdminBillingSnapshot() {
  const response = await authenticatedHttp.get<{ success: true; data: AdminBillingSnapshot }>("/api/v1/admin/payments/overview");
  return response.data.data;
}

export async function activateAdminSubscriptionManually(payload: AdminManualActivationInput) {
  const response = await authenticatedHttp.post<{
    success: true;
    data: {
      subscription: ActiveSubscriptionSummary;
      user: {
        email: string;
        fullName: string;
        id: string;
      };
    };
  }>("/api/v1/admin/payments/manual-activation", payload);

  return response.data.data;
}

export async function fetchAdminNotifications() {
  const response = await authenticatedHttp.get<{ success: true; data: AdminNotificationCenter }>("/api/v1/admin/notifications");
  return response.data.data;
}

export async function fetchAdminContentReviewQueue() {
  const response = await authenticatedHttp.get<{ success: true; data: AdminApprovalQueueSnapshot }>("/api/v1/admin/content-review");
  return response.data.data;
}

export async function markAdminNotificationsRead() {
  const response = await authenticatedHttp.post<{ success: true; data: { success: true } }>("/api/v1/admin/notifications/read-all");
  return response.data.data;
}

export async function approveAdminLibraryMaterial(materialId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/library-materials/${materialId}/approve`
  );

  return response.data.data;
}

export async function approveAdminSubjectSummaryCase(caseId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/subject-summary-cases/${caseId}/approve`
  );

  return response.data.data;
}

export async function approveAdminSubjectSummaryEntry(entryId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/subject-summary-entries/${entryId}/approve`
  );

  return response.data.data;
}

export async function approveAdminBarFinalExamQuestion(questionId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/bar-final-exam-questions/${questionId}/approve`
  );

  return response.data.data;
}

export async function declineAdminLibraryMaterial(materialId: string, reason: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/library-materials/${materialId}/decline`,
    { reason }
  );

  return response.data.data;
}

export async function declineAdminSubjectSummaryCase(caseId: string, reason: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/subject-summary-cases/${caseId}/decline`,
    { reason }
  );

  return response.data.data;
}

export async function declineAdminSubjectSummaryEntry(entryId: string, reason: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/subject-summary-entries/${entryId}/decline`,
    { reason }
  );

  return response.data.data;
}

export async function declineAdminBarFinalExamQuestion(questionId: string, reason: string) {
  const response = await authenticatedHttp.post<{ success: true; data: { id: string; success: true } }>(
    `/api/v1/admin/approvals/bar-final-exam-questions/${questionId}/decline`,
    { reason }
  );

  return response.data.data;
}

export async function fetchAdminUserDetail(userId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: AdminUserDetail }>(`/api/v1/admin/users/${userId}`);

  return response.data.data;
}

export async function createAdminUser(payload: AdminCreateUserInput) {
  const response = await authenticatedHttp.post<{ success: true; data: AdminUserDetail }>("/api/v1/admin/users", payload);

  return response.data.data;
}

export async function updateAdminUserPassword(userId: string, payload: AdminUserPasswordInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/password`,
    payload
  );

  return response.data.data;
}

export async function downloadAdminUsersCsv(filters: AdminUserListFilters) {
  const response = await authenticatedHttp.get("/api/v1/admin/users/export", {
    params: Object.fromEntries(createQueryParams(filters).entries()),
    responseType: "blob"
  });

  return response.data as Blob;
}

export async function updateAdminUserStatus(userId: string, status: AdminUserStatus) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/status`,
    { status }
  );

  return response.data.data;
}

export async function updateAdminUserProfile(userId: string, payload: AdminUserProfileInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/profile`,
    payload
  );

  return response.data.data;
}

export async function updateAdminUserRoles(userId: string, roleCodes: string[]) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/roles`,
    { roleCodes }
  );

  return response.data.data;
}

export async function updateAdminUserDeviceLimit(userId: string, payload: AdminUserDeviceLimitInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/device-limit`,
    payload
  );

  return response.data.data;
}

export async function resetAdminUserDevices(userId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: AdminUserDetail }>(
    `/api/v1/admin/users/${userId}/devices/reset`
  );

  return response.data.data;
}

// CBT Types
export type CbtStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_SELECT" | "SHORT_ANSWER";
export type DifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type CbtQuestionOption = {
  id: string;
  label: string;
  text?: string;
  isCorrect: boolean;
  displayOrder: number;
};

export type CbtQuestion = {
  id: string;
  cbtId?: string | null;
  prompt: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  points: number;
  explanation?: string;
  subjectId?: string | null;
  topicId?: string | null;
  displayOrder: number;
  isInQuestionBank: boolean;
  imageUrl?: string | null;
  attachmentUrls?: string[];
  createdAt: string;
  updatedAt: string;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  options: CbtQuestionOption[];
};

export type Cbt = {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  courseId?: string;
  subjectId?: string;
  topicId?: string;
  learningMaterialId?: string;
  durationSeconds: number;
  totalQuestions: number;
  questionsToAnswer?: number | null;
  passPercentage: number;
  maxAttempts: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isEnabled: boolean;
  showScoreOnCompletion: boolean;
  showCorrectAnswersOnCompletion: boolean;
  showExplanationsOnCompletion: boolean;
  status: CbtStatus;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  _count: { questions: number; attempts: number };
  questions: CbtQuestion[];
};

export type CbtAttemptSummary = {
  id: string;
  attemptNumber: number;
  userId: string;
  user: { id: string; email: string; fullName: string };
  startedAt: string;
  submittedAt?: string | null;
  result?: {
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    totalPoints: number;
    earnedPoints: number;
    percentageScore: number;
    passed: boolean;
  } | null;
};

export type CbtResultsSnapshot = {
  cbt: Cbt;
  totalAttempts: number;
  passedAttempts: number;
  failedAttempts: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  attempts: CbtAttemptSummary[];
};

export type CbtListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | CbtStatus;
  isEnabled?: "all" | "true" | "false";
  subjectId?: string;
  sortBy?: "createdAt" | "title" | "updatedAt";
  sortOrder?: "asc" | "desc";
};

export type CbtListSnapshot = {
  cbts: Cbt[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; subjectId: string }>;
};

export type CbtCreateInput = {
  title: string;
  description?: string;
  instructions?: string;
  courseId?: string;
  subjectId?: string;
  topicId?: string;
  learningMaterialId?: string;
  durationSeconds: number;
  totalQuestions?: number;
  questionsToAnswer?: number | null;
  passPercentage: number;
  maxAttempts: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isEnabled: boolean;
  showScoreOnCompletion?: boolean;
  showCorrectAnswersOnCompletion?: boolean;
  showExplanationsOnCompletion?: boolean;
  status: CbtStatus;
  randomizeQuestions?: boolean;
  randomizeAnswers?: boolean;
};

export type CbtUpdateInput = Partial<CbtCreateInput>;

export type QuestionListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  subjectId?: string | null;
  topicId?: string | null;
  questionType?: "all" | QuestionType;
  difficulty?: "all" | DifficultyLevel;
  sortBy?: "createdAt" | "updatedAt" | "displayOrder";
  sortOrder?: "asc" | "desc";
  onlyQuestionBank?: boolean;
};

export type QuestionListSnapshot = {
  questions: CbtQuestion[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  subjects: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; subjectId: string }>;
};

export type QuestionCreateInput = {
  prompt: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  points?: number;
  explanation?: string;
  subjectId?: string;
  topicId?: string;
  displayOrder?: number;
  isInQuestionBank?: boolean;
  imageUrl?: string | null;
  attachmentUrls?: string[];
  options?: Array<{ label: string; text?: string; isCorrect: boolean; displayOrder: number }>;
};

export type QuestionUpdateInput = Partial<QuestionCreateInput>;

// CBT Admin API Functions
export async function fetchCbtList(filters: CbtListFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: CbtListSnapshot }>(
    "/api/v1/admin/cbt",
    { params: Object.fromEntries(createQueryParams(filters).entries()) }
  );
  return response.data.data;
}

export async function fetchCbtDetail(cbtId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}`);
  return response.data.data;
}

export async function createCbt(payload: CbtCreateInput) {
  const response = await authenticatedHttp.post<{ success: true; data: Cbt }>("/api/v1/admin/cbt", payload);
  return response.data.data;
}

export async function updateCbt(cbtId: string, payload: CbtUpdateInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}`, payload);
  return response.data.data;
}

export async function deleteCbt(cbtId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(`/api/v1/admin/cbt/${cbtId}`);
  return response.data.data;
}

export async function duplicateCbt(cbtId: string) {
  const response = await authenticatedHttp.post<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}/duplicate`);
  return response.data.data;
}

export async function publishCbt(cbtId: string) {
  const response = await authenticatedHttp.patch<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}/publish`);
  return response.data.data;
}

export async function unpublishCbt(cbtId: string) {
  const response = await authenticatedHttp.patch<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}/unpublish`);
  return response.data.data;
}

export async function fetchCbtResults(cbtId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: CbtResultsSnapshot }>(`/api/v1/admin/cbt/${cbtId}/results`);
  return response.data.data;
}

export async function exportCbtResultsCsv(cbtId: string) {
  const response = await authenticatedHttp.get(`/api/v1/admin/cbt/${cbtId}/results/export`, { responseType: "blob" });
  return response.data as Blob;
}

// Question Bank Admin API Functions
export async function fetchQuestionList(filters: QuestionListFilters) {
  const response = await authenticatedHttp.get<{ success: true; data: QuestionListSnapshot }>(
    "/api/v1/admin/cbt-questions",
    { params: Object.fromEntries(createQueryParams(filters).entries()) }
  );
  return response.data.data;
}

export async function fetchQuestionDetail(questionId: string) {
  const response = await authenticatedHttp.get<{ success: true; data: CbtQuestion }>(`/api/v1/admin/cbt-questions/${questionId}`);
  return response.data.data;
}

export async function createQuestion(payload: QuestionCreateInput) {
  const response = await authenticatedHttp.post<{ success: true; data: CbtQuestion }>("/api/v1/admin/cbt-questions", payload);
  return response.data.data;
}

export async function updateQuestion(questionId: string, payload: QuestionUpdateInput) {
  const response = await authenticatedHttp.patch<{ success: true; data: CbtQuestion }>(`/api/v1/admin/cbt-questions/${questionId}`, payload);
  return response.data.data;
}

export async function deleteQuestion(questionId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: { id: string; success: true } }>(`/api/v1/admin/cbt-questions/${questionId}`);
  return response.data.data;
}

export async function addQuestionToCbt(cbtId: string, questionId: string, displayOrder?: number) {
  const response = await authenticatedHttp.post<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}/questions`, {
    questionId,
    displayOrder
  });
  return response.data.data;
}

export async function removeQuestionFromCbt(cbtId: string, questionId: string) {
  const response = await authenticatedHttp.delete<{ success: true; data: Cbt }>(`/api/v1/admin/cbt/${cbtId}/questions/${questionId}`);
  return response.data.data;
}
