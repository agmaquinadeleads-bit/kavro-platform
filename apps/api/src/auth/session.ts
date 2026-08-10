export type KavroSession = {
  accessToken: string;
  userId: string;
  email: string;
  organizationId: string;
  role: "owner" | "admin" | "member";
};
