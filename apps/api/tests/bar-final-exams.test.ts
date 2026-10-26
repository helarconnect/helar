import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({ prisma: {
  subjectSummarySubject: { findFirst: vi.fn() },
  barFinalExamTopic: { findFirst: vi.fn() },
  barFinalExamQuestion: { create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() }
} }));

import { prisma } from "../src/lib/prisma.js";
import {
  createAdminBarFinalExamQuestion, updateAdminBarFinalExamQuestion,
  parseBarFinalExamQuestionInput, parseAdminBarFinalExamMcqQuestionFilters
} from "../src/bar-final-exams.js";

const subjectId = "507f1f77bcf86cd799439011";
const input = { answer: "Model answer", question: "Theory question", subjectId, examDate: "", status: "DRAFT" as const };
const row = { ...input, id: subjectId, topicId: null, subject: { id: subjectId, name: "Civil" }, topic: null, year: 2026, examDate: null, createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.barFinalExamTopic.findFirst).mockResolvedValue({ id: subjectId } as never);
  vi.mocked(prisma.subjectSummarySubject.findFirst).mockResolvedValue({ id: subjectId } as never);
  vi.mocked(prisma.barFinalExamQuestion.create).mockResolvedValue(row as never);
  vi.mocked(prisma.barFinalExamQuestion.update).mockResolvedValue(row as never);
});

describe("Bar Final theory year", () => {
  it("accepts existing payloads without year and allows clearing year", () => {
    expect(parseBarFinalExamQuestionInput(input).year).toBeUndefined();
    expect(parseBarFinalExamQuestionInput({ ...input, year: null }).year).toBeNull();
  });
  it.each([1899, 2101, 2026.5, "2026"])("rejects invalid year %s", (year) => {
    expect(() => parseBarFinalExamQuestionInput({ ...input, year })).toThrow();
  });
  it("persists and returns year on creation", async () => {
    const result = await createAdminBarFinalExamQuestion({ ...input, year: 2026 }, [], subjectId);
    expect(prisma.barFinalExamQuestion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ year: 2026 }) }));
    expect(result.year).toBe(2026);
  });
  it("updates year, supports clearing, and preserves it when omitted", async () => {
    for (const year of [2025, null, undefined]) {
      await updateAdminBarFinalExamQuestion(subjectId, { ...input, year }, [], subjectId);
      const args = vi.mocked(prisma.barFinalExamQuestion.update).mock.calls.at(-1)![0];
      if (year === undefined) expect(args.data).not.toHaveProperty("year");
      else expect(args.data.year).toBe(year);
    }
  });
});

it("accepts 300 MCQ questions per topic page", () => {
  expect(parseAdminBarFinalExamMcqQuestionFilters({ pageSize: "300", topicId: subjectId }).pageSize).toBe(300);
});
