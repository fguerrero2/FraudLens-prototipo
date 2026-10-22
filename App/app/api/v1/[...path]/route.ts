import { handleApiRequest } from '../../../../server/app';

// Single function for the whole /api/v1 surface; the contract is the same one the mobile app already uses.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const handler = (request: Request) => handleApiRequest(request);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
