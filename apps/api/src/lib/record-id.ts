import { z } from "zod";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectIdPattern = /^[0-9a-f]{24}$/i;

export function isSupportedRecordId(value: string) {
  return uuidPattern.test(value) || objectIdPattern.test(value);
}

export const recordIdSchema = z.string().trim().refine(isSupportedRecordId, {
  message: "Expected a UUID or MongoDB ObjectId."
});
