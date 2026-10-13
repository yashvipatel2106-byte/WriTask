export const DEPARTMENT_OPTIONS = [
  "Engineering",
  "Design",
  "Product",
  "Marketing",
  "Operations",
  "HR",
] as const;

export type Department = (typeof DEPARTMENT_OPTIONS)[number];
