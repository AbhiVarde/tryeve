import {
  getTokenResponse,
  startAuthorization,
  UserAuthorizationRequiredError,
} from "@vercel/connect";

const APP_CONNECTOR = process.env.GITHUB_CONNECTOR_UID ?? "github/tryeve";
const OAUTH_CONNECTOR =
  process.env.GITHUB_OAUTH_CONNECTOR_UID ?? "github.com/tryeve-oauth";
const SCOPES = ["repo"];

export async function getGithubToken(visitorId: string) {
  try {
    const response = await getTokenResponse(APP_CONNECTOR, {
      subject: { type: "user", id: visitorId },
      scopes: SCOPES,
    });
    return { token: response.token, needsAuth: false as const };
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const { url } = await startAuthorization(APP_CONNECTOR, {
        subject: { type: "user", id: visitorId },
        scopes: SCOPES,
      });
      return { token: null, needsAuth: true as const, authorizeUrl: url };
    }
    throw err;
  }
}

export async function getGithubOAuthToken(visitorId: string) {
  try {
    const response = await getTokenResponse(OAUTH_CONNECTOR, {
      subject: { type: "user", id: visitorId },
      scopes: SCOPES,
    });
    return { token: response.token, needsAuth: false as const };
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const { url } = await startAuthorization(OAUTH_CONNECTOR, {
        subject: { type: "user", id: visitorId },
        scopes: SCOPES,
      });
      return { token: null, needsAuth: true as const, authorizeUrl: url };
    }
    throw err;
  }
}
