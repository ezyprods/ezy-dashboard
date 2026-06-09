import { auth } from "@/lib/auth";

export const GET = (req: Request) => auth.handler(req);
export const POST = (req: Request) => auth.handler(req);
