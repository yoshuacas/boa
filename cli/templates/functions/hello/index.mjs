export default async function handler(req, ctx) {
  return {
    status: 200,
    body: {
      message: 'Hello from BOA Functions!',
      userId: ctx.userId,
      role: ctx.role,
    },
  };
}
