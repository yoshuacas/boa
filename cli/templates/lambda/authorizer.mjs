import { createPgrest } from 'pgrest-lambda';

const pgrest = createPgrest();

export const handler = pgrest.authorizer;
