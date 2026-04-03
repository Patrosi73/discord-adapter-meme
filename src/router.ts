import Router from "@koa/router";
import { apiRouter } from "./api.ts";
import { cdnRouter } from "./cdn.ts";
import { ClientLoader } from "./client-loader.ts";

export const router = new Router();

const DISCORD_ROUTES = [
    "/app",
    "/channels",
    "/oauth2",
    "/message-requests",
    "/store",
    "/shop",
    "/quest-home",
    "/login",
    "/register",
    "/settings",
    "/billing",
    "/discovery",
    "/invite",
    "/template",
    "/gifts",
    "/activities",
    "/library",
    "/connections",
    "/application-directory",
    "/quests",
    "/voice",
    "/activity",
    "/discovery",
    "/discovery/quests",
    "/discovery/servers",
    "/discovery/applications",
    "/member-verification",
    "/member-verification-for-hub",
    "/popout",
    "/events"
];

router.use(apiRouter.routes(), apiRouter.allowedMethods());
router.use(cdnRouter.routes(), cdnRouter.allowedMethods());

router.get("/", async ctx => {
    ctx.type = "html";
    ctx.body = `
    <!DOCTYPE html>
    <html>
    <head>

    </head>
    <body>
        <div id="container">
            <div class="row">
                <span>Fluxer Token:</span>
                <input type="password" id="fluxer-token" autocomplete="off" />
                <button id="save-token">Save</button>
            </div>

            <div class="row">
                <input type="checkbox" id="show-token">
                <label for="show-token">Show Token</label>
            </div>

            <a href="/app">Go to Discord</a>
        </div>
        <script>
        (() => {
            // Handle show/hide token checkbox
            const tokenInput = document.getElementById("fluxer-token");
            const showTokenCheckbox = document.getElementById("show-token");
            const saveTokenButton = document.getElementById("save-token");

            // Load saved token from localStorage
            const savedTokenJson = localStorage.getItem("token");
            let savedToken = "";
            if (savedTokenJson) {
                try {
                    savedToken = JSON.parse(savedTokenJson) || "";
                } catch (e) {
                    savedToken = "";
                }
            }
            if (savedToken && tokenInput) {
                tokenInput.value = savedToken;
            }

            if (showTokenCheckbox && tokenInput) {
                showTokenCheckbox.addEventListener("change", () => {
                    tokenInput.type = showTokenCheckbox.checked ? "text" : "password";
                });
            }

            if (saveTokenButton && tokenInput) {
                saveTokenButton.addEventListener("click", () => {
                    localStorage.setItem("token", JSON.stringify(tokenInput.value));
                    alert("Token saved!");
                });
            }
        })();
        </script>
    </body>
  `;
});

const handleDiscordRoute = (ctx: any) => {
    ctx.type = "html";
    ctx.body = ClientLoader.getHtml();
};

for (const route of DISCORD_ROUTES) {
    // Exact match
    router.get(route, handleDiscordRoute);
    // Sub-paths using path-to-regexp v8 syntax
    router.get(`${route}/*parts`, handleDiscordRoute);
}
