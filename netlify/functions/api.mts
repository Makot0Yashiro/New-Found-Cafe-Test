import type { Config } from '@netlify/functions';
import { createHandler } from '../../server/handler.js';
export default async (req:Request) => createHandler()(req);
export const config:Config={path:'/api/*'};
