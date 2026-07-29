import {
  getTokenResponse,
  startAuthorization,
  UserAuthorizationRequiredError,
} from "@vercel/connect";

const CONNECTOR =
  process.env.GITHUB_CONNECTOR_UID ?? "github/tryeve-agent-deploy-syncui";
const SCOPES = ["repo"];

export async function getGithubToken(visitorId: string) {
  try {
    const response = await getTokenResponse(CONNECTOR, {
      subject: { type: "user", id: visitorId },
      scopes: SCOPES,
    });
    return { token: response.token, needsAuth: false as const };
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const { url } = await startAuthorization(CONNECTOR, {
        subject: { type: "user", id: visitorId },
        scopes: SCOPES,
      });
      return { token: null, needsAuth: true as const, authorizeUrl: url };
    }
    throw err;
  }
}
