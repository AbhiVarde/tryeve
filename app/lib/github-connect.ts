import {
  getTokenResponse,
  startAuthorization,
  UserAuthorizationRequiredError,
} from "@vercel/connect";

const APP_CONNECTOR = process.env.GITHUB_CONNECTOR_UID ?? "github/tryeve";
const OAUTH_CONNECTOR =
  process.env.GITHUB_OAUTH_CONNECTOR_UID ?? "github.com/tryeve-oauth";
const SCOPES = ["repo"];

async function getConnectorToken(connector: string, visitorId: string) {
  try {
    const response = await getTokenResponse(connector, {
      subject: { type: "user", id: visitorId },
      scopes: SCOPES,
    });
    return { token: response.token, needsAuth: false as const };
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const { url } = await startAuthorization(connector, {
        subject: { type: "user", id: visitorId },
        scopes: SCOPES,
      });
      return { token: null, needsAuth: true as const, authorizeUrl: url };
    }
    throw err;
  }
}

// app-installation token, used for pushing files via the contents api
export async function getGithubToken(visitorId: string) {
  return getConnectorToken(APP_CONNECTOR, visitorId);
}

// user-scoped token, used for creating repos under the visitor's own account
export async function getGithubUserToken(visitorId: string) {
  return getConnectorToken(OAUTH_CONNECTOR, visitorId);
}
