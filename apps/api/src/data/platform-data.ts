export type PlatformKpi = {
  label: string;
  value: string;
  trend: string;
};

export type CourseSnapshot = {
  id: string;
  title: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  duration: string;
  learners: number;
};

export type DashboardSnapshot = {
  product: string;
  headline: string;
  highlights: string[];
  metrics: PlatformKpi[];
  featuredCourses: CourseSnapshot[];
};

export const dashboardSnapshot: DashboardSnapshot = {
  product: "LexLearn",
  headline: "Legal learning for institutions, tutors, and modern practitioners.",
  highlights: [
    "Role-based workspaces for students, tutors, administrators, moderators, and finance teams.",
    "Integrated digital library, CBT engine, assignments, certificates, and subscription billing.",
    "Mobile-first experience with shared backend architecture and enterprise governance controls."
  ],
  metrics: [
    { label: "Active learners", value: "24.8k", trend: "+12.4%" },
    { label: "Institution accounts", value: "118", trend: "+9.1%" },
    { label: "Completion rate", value: "87%", trend: "+4.8%" },
    { label: "Monthly recurring revenue", value: "$186k", trend: "+18.6%" }
  ],
  featuredCourses: [
    {
      id: "course-criminal-litigation",
      title: "Advanced Criminal Litigation Strategy",
      category: "Criminal Law",
      level: "Advanced",
      duration: "8 weeks",
      learners: 2480
    },
    {
      id: "course-corporate-governance",
      title: "Corporate Governance for Modern Counsel",
      category: "Corporate Law",
      level: "Intermediate",
      duration: "6 weeks",
      learners: 1934
    },
    {
      id: "course-legal-drafting",
      title: "Legal Drafting and Opinion Writing",
      category: "Legal Drafting",
      level: "Beginner",
      duration: "5 weeks",
      learners: 3122
    }
  ]
};
