// MUST be the first import in cors-integration.test.ts.
//
// ESM evaluates imported modules in source order, and server.ts reads
// LAZYLIFT_CORS_ORIGINS while building its middleware stack. tests/helpers.ts imports
// server.ts, so this value has to be in place before that module is evaluated -- hence a
// side-effect module rather than an assignment in the test body.
process.env.LAZYLIFT_CORS_ORIGINS = 'https://lazylift.vercel.app,https://lazylift-git-main-team.vercel.app';
