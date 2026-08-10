import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { KavroSession } from "./session";

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): KavroSession => {
  const request = context.switchToHttp().getRequest<{ kavroSession: KavroSession }>();
  return request.kavroSession;
});
