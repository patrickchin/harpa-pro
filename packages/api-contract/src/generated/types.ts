export interface paths {
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service is alive. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                            /** @enum {string} */
                            service: "api";
                            version: string;
                            gitCommit: string;
                            buildTime?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service is ready to serve traffic. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                            /** @enum {string} */
                            db: "up";
                            head: string | null;
                        };
                    };
                };
                /** @description Service is not ready (DB or schema check failed). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: false;
                            /** @enum {string} */
                            db: "down" | "schema-missing" | "head-mismatch";
                            expected?: string;
                            actual?: string | null;
                            message?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The isolated admin service database is ready. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                            /** @enum {string} */
                            db: "up";
                            head: string | null;
                        };
                    };
                };
                /** @description The isolated admin database or schema is not ready. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: false;
                            /** @enum {string} */
                            db: "down" | "schema-missing" | "head-mismatch";
                            expected?: string;
                            actual?: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/waitlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        company?: string;
                        role?: string;
                        source?: string;
                        turnstileToken: string;
                    };
                };
            };
            responses: {
                /** @description Signup accepted (neutral response). */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            success: boolean;
                            message: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/waitlist/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        token: string;
                    };
                };
            };
            responses: {
                /** @description Confirmed. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            success: true;
                            message: string;
                        };
                    };
                };
                /** @description Bad token. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/.well-known/apple-app-site-association": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Apple App Site Association manifest. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            applinks: {
                                apps: string[];
                                details: {
                                    appID: string;
                                    paths: string[];
                                }[];
                            };
                        };
                    };
                };
                /** @description iOS universal links are not configured on this origin. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                /** @enum {string} */
                                code: "not_configured";
                                message: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/.well-known/assetlinks.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Android Asset Links manifest. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            relation: string[];
                            target: {
                                /** @enum {string} */
                                namespace: "android_app";
                                package_name: string;
                                sha256_cert_fingerprints: string[];
                            };
                        }[];
                    };
                };
                /** @description Android app links are not configured on this origin. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                /** @enum {string} */
                                code: "not_configured";
                                message: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current user. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                /** Format: email */
                                email: string;
                                displayName: string | null;
                                companyName: string | null;
                                createdAt: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description User not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Account deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description User not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Deletion temporarily unavailable during storage-lifecycle rollout. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        displayName?: string;
                        companyName?: string;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                /** Format: email */
                                email: string;
                                displayName: string | null;
                                companyName: string | null;
                                createdAt: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/me/deletion-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Account deletion consequences for the signed-in user. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: email */
                            email: string;
                            soloProjectsDeleted: {
                                id: string;
                                name: string;
                            }[];
                            sharedProjectsTransferred: {
                                id: string;
                                name: string;
                                newOwnerId: string;
                                /** Format: email */
                                newOwnerEmail: string;
                            }[];
                            sharedProjectsLeft: {
                                id: string;
                                name: string;
                            }[];
                            personalFilesDeleted: number;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description User not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Usage summary. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            months: {
                                month: string;
                                reports: number;
                                voiceNotes: number;
                            }[];
                            totals: {
                                reports: number;
                                voiceNotes: number;
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                inputSeconds: number;
                                calls: number;
                            };
                            usageTokens: {
                                month: string;
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                inputSeconds: number;
                                calls: number;
                            }[];
                            usageByModel: {
                                vendor: string;
                                model: string;
                                /** @enum {string} */
                                operation: "chat" | "transcribe" | "generate_report";
                                calls: number;
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                inputSeconds: number;
                            }[];
                            /** @enum {string} */
                            plan?: "free" | "pro" | "enterprise";
                            limits?: {
                                /** @enum {string} */
                                kind: "report_generate" | "voice_transcribe" | "voice_summarize" | "ai_input_tokens" | "ai_output_tokens";
                                limit: number | null;
                                used: number;
                                remaining: number | null;
                                resetAt: string;
                                /** @enum {string} */
                                plan: "free" | "pro" | "enterprise";
                                overridden: boolean;
                            }[];
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/usage/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                    operation?: "chat" | "transcribe" | "generate_report";
                    vendor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Paginated raw LLM usage events, newest first. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: string;
                                createdAt: string;
                                vendor: string;
                                model: string;
                                /** @enum {string} */
                                operation: "chat" | "transcribe" | "generate_report";
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                inputSeconds: number | null;
                                latencyMs: number;
                                /** @enum {string} */
                                fixtureMode: "live" | "replay" | "record";
                                /** @enum {string} */
                                status: "ok" | "error";
                                projectId: string | null;
                                reportId: string | null;
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/limits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Effective limits. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            plan: "free" | "pro" | "enterprise";
                            buckets: {
                                /** @enum {string} */
                                kind: "report_generate" | "voice_transcribe" | "voice_summarize" | "ai_input_tokens" | "ai_output_tokens";
                                limit: number | null;
                                used: number;
                                remaining: number | null;
                                resetAt: string;
                                /** @enum {string} */
                                plan: "free" | "pro" | "enterprise";
                                overridden: boolean;
                            }[];
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Page of projects. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: string;
                                name: string;
                                clientName: string | null;
                                address: string | null;
                                ownerId: string;
                                /** @enum {string} */
                                myRole: "owner" | "editor" | "viewer";
                                createdAt: string;
                                updatedAt: string;
                                stats?: {
                                    totalReports: number;
                                    drafts: number;
                                    lastReportAt: string | null;
                                };
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        name: string;
                        clientName?: string;
                        address?: string;
                    };
                };
            };
            responses: {
                /** @description Created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            name: string;
                            clientName: string | null;
                            address: string | null;
                            ownerId: string;
                            /** @enum {string} */
                            myRole: "owner" | "editor" | "viewer";
                            createdAt: string;
                            updatedAt: string;
                            stats?: {
                                totalReports: number;
                                drafts: number;
                                lastReportAt: string | null;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            name: string;
                            clientName: string | null;
                            address: string | null;
                            ownerId: string;
                            /** @enum {string} */
                            myRole: "owner" | "editor" | "viewer";
                            createdAt: string;
                            updatedAt: string;
                            stats?: {
                                totalReports: number;
                                drafts: number;
                                lastReportAt: string | null;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found or not owner. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        name?: string;
                        clientName?: string;
                        address?: string;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            name: string;
                            clientName: string | null;
                            address: string | null;
                            ownerId: string;
                            /** @enum {string} */
                            myRole: "owner" | "editor" | "viewer";
                            createdAt: string;
                            updatedAt: string;
                            stats?: {
                                totalReports: number;
                                drafts: number;
                                lastReportAt: string | null;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/projects/{project}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Members. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                userId: string;
                                displayName: string | null;
                                /** Format: email */
                                email: string;
                                /** @enum {string} */
                                role: "owner" | "editor" | "viewer";
                                joinedAt: string;
                            }[];
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not a member. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        /**
                         * @default editor
                         * @enum {string}
                         */
                        role?: "owner" | "editor" | "viewer";
                    };
                };
            };
            responses: {
                /** @description Member added. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            userId: string;
                            displayName: string | null;
                            /** Format: email */
                            email: string;
                            /** @enum {string} */
                            role: "owner" | "editor" | "viewer";
                            joinedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not an owner. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description User not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Already a member. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/members/{user}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    user: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Removed. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not an owner. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Last owner. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    user: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        role: "owner" | "editor" | "viewer";
                    };
                };
            };
            responses: {
                /** @description Member role updated (or unchanged if already correct). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            userId: string;
                            displayName: string | null;
                            /** Format: email */
                            email: string;
                            /** @enum {string} */
                            role: "owner" | "editor" | "viewer";
                            joinedAt: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not an owner. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Member not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Last owner. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/projects/{project}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                    status?: "draft" | "finalized";
                };
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Page of reports. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Project not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        visitDate?: string;
                    };
                };
            };
            responses: {
                /** @description Created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            number: number;
                            projectId: string;
                            /** @enum {string} */
                            status: "draft" | "finalized";
                            visitDate: string | null;
                            body: {
                                meta: {
                                    title: string | null;
                                    summary: string | null;
                                    visitDate: string | null;
                                };
                                weather: {
                                    condition: string | null;
                                    temperature: string | null;
                                    wind: string | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: string | null;
                                    hours: string | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: string | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    severity: string | null;
                                    description: string | null;
                                    action: string | null;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            notesChangedAt: string | null;
                            generatedAt: string | null;
                            needsRegeneration: boolean;
                            finalizedAt: string | null;
                            pdfUrl: string | null;
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Project not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/comments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Published report review comments. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: string;
                                reportId: string;
                                authorId: string;
                                authorDisplayName: string;
                                body: string;
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report is not finalized. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        body: string;
                    };
                };
            };
            responses: {
                /** @description Review comment created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            reportId: string;
                            authorId: string;
                            authorDisplayName: string;
                            body: string;
                            createdAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report is not finalized. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Report. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            number: number;
                            projectId: string;
                            /** @enum {string} */
                            status: "draft" | "finalized";
                            visitDate: string | null;
                            body: {
                                meta: {
                                    title: string | null;
                                    summary: string | null;
                                    visitDate: string | null;
                                };
                                weather: {
                                    condition: string | null;
                                    temperature: string | null;
                                    wind: string | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: string | null;
                                    hours: string | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: string | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    severity: string | null;
                                    description: string | null;
                                    action: string | null;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            notesChangedAt: string | null;
                            generatedAt: string | null;
                            needsRegeneration: boolean;
                            finalizedAt: string | null;
                            pdfUrl: string | null;
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        visitDate?: string | null;
                        body?: {
                            meta: {
                                title: string | null;
                                summary: string | null;
                                visitDate: string | null;
                            };
                            weather: {
                                condition: string | null;
                                temperature: string | null;
                                wind: string | null;
                                impact: string | null;
                            } | null;
                            workers: {
                                role: string;
                                count: string | null;
                                hours: string | null;
                                notes: string | null;
                            }[];
                            materials: {
                                name: string;
                                quantity: string | null;
                                unit: string | null;
                                status: string | null;
                                condition: string | null;
                                notes: string | null;
                            }[];
                            issues: {
                                title: string;
                                severity: string | null;
                                description: string | null;
                                action: string | null;
                                attachments?: {
                                    images?: string[];
                                    documents?: string[];
                                };
                            }[];
                            nextSteps: string[];
                            summarySections: {
                                title: string;
                                body: string;
                                attachments?: {
                                    images?: string[];
                                    documents?: string[];
                                };
                            }[];
                        } | null;
                        expectedUpdatedAt?: string;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            number: number;
                            projectId: string;
                            /** @enum {string} */
                            status: "draft" | "finalized";
                            visitDate: string | null;
                            body: {
                                meta: {
                                    title: string | null;
                                    summary: string | null;
                                    visitDate: string | null;
                                };
                                weather: {
                                    condition: string | null;
                                    temperature: string | null;
                                    wind: string | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: string | null;
                                    hours: string | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: string | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    severity: string | null;
                                    description: string | null;
                                    action: string | null;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                    attachments?: {
                                        images?: string[];
                                        documents?: string[];
                                    };
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            notesChangedAt: string | null;
                            generatedAt: string | null;
                            needsRegeneration: boolean;
                            finalizedAt: string | null;
                            pdfUrl: string | null;
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report is finalized or changed elsewhere. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        } | {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/projects/{project}/reports/{number}/debug": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Report debug payload. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            prompt: {
                                system: string;
                                user: string;
                            };
                            notes: {
                                id: string;
                                /** @enum {string} */
                                kind: "text" | "voice" | "image" | "document";
                                body: string | null;
                                transcript: string | null;
                                /** @default [] */
                                files: {
                                    id: string;
                                    fileId: string;
                                    thumbnailFileId: string | null;
                                    position: number;
                                    caption: string | null;
                                }[];
                                createdAt: string;
                            }[];
                            lastGeneration: {
                                requestedAt: string;
                                finishedAt: string | null;
                                vendor: string;
                                model: string;
                                /** @enum {string} */
                                fixtureMode: "live" | "replay" | "record";
                                systemPrompt: string;
                                userPrompt: string;
                                response: string;
                                usage: {
                                    inputTokens: number;
                                    outputTokens: number;
                                    cachedTokens?: number;
                                } | null;
                            } | null;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        noteId: string;
                        target: {
                            /** @enum {string} */
                            kind: "issue";
                            index: number;
                        } | {
                            /** @enum {string} */
                            kind: "section";
                            index: number;
                        } | unknown;
                        expectedBodyVersion: string | null;
                    };
                };
            };
            responses: {
                /** @description Attachment placement updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report is finalized or has a stale body version. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/projects/{project}/reports/{number}/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        fixtureName?: string;
                        expectedUpdatedAt?: string;
                    };
                };
            };
            responses: {
                /** @description Generated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                            debug?: {
                                systemPrompt?: string;
                                userPrompt?: string;
                                rawText?: string;
                                model?: string;
                                vendor?: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        } | {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Upstream AI provider error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        fixtureName?: string;
                        expectedUpdatedAt?: string;
                    };
                };
            };
            responses: {
                /** @description Generated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                            debug?: {
                                systemPrompt?: string;
                                userPrompt?: string;
                                rawText?: string;
                                model?: string;
                                vendor?: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        } | {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Upstream AI provider error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/finalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        expectedUpdatedAt?: string;
                    };
                };
            };
            responses: {
                /** @description Finalized. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        } | {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/unfinalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        expectedUpdatedAt?: string;
                    };
                };
            };
            responses: {
                /** @description Unfinalized. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                id: string;
                                number: number;
                                projectId: string;
                                /** @enum {string} */
                                status: "draft" | "finalized";
                                visitDate: string | null;
                                body: {
                                    meta: {
                                        title: string | null;
                                        summary: string | null;
                                        visitDate: string | null;
                                    };
                                    weather: {
                                        condition: string | null;
                                        temperature: string | null;
                                        wind: string | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: string | null;
                                        hours: string | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: string | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        severity: string | null;
                                        description: string | null;
                                        action: string | null;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                        attachments?: {
                                            images?: string[];
                                            documents?: string[];
                                        };
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                notesChangedAt: string | null;
                                generatedAt: string | null;
                                needsRegeneration: boolean;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
                            };
                        } | {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project}/reports/{number}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                    number: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Signed URL to rendered PDF. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uri */
                            url: string;
                            expiresAt: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/p/{project}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    project: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Resolved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            type: "project";
                            projectId: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/r/{report}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    report: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Resolved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            type: "report";
                            projectId: string;
                            reportId: string;
                            reportNumber: number;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/{report}/notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path: {
                    report: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Notes timeline. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: string;
                                reportId: string;
                                authorId: string;
                                /** @enum {string} */
                                kind: "text" | "voice" | "image" | "document";
                                body: string | null;
                                fileId: string | null;
                                thumbnailFileId: string | null;
                                /** @default [] */
                                files: {
                                    id: string;
                                    fileId: string;
                                    thumbnailFileId: string | null;
                                    position: number;
                                    caption: string | null;
                                }[];
                                transcript: string | null;
                                title: string | null;
                                summary: string | null;
                                durationSec: number | null;
                                language: string | null;
                                transcribeProvider: string | null;
                                transcribedAt: string | null;
                                /** @enum {string|null} */
                                source: "typed" | "voice" | "camera" | "gallery" | "upload" | null;
                                /** @default {} */
                                meta: {
                                    [key: string]: unknown;
                                };
                                createdAt: string;
                                updatedAt: string;
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    report: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind: "text" | "voice" | "image" | "document";
                        body?: string | null;
                        fileId?: string | null;
                        thumbnailFileId?: string | null;
                        files?: {
                            fileId: string;
                            thumbnailFileId?: string | null;
                        }[];
                        transcript?: string | null;
                        title?: string | null;
                        summary?: string | null;
                        /** @enum {string} */
                        source?: "typed" | "voice" | "camera" | "gallery" | "upload";
                        meta?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            reportId: string;
                            authorId: string;
                            /** @enum {string} */
                            kind: "text" | "voice" | "image" | "document";
                            body: string | null;
                            fileId: string | null;
                            thumbnailFileId: string | null;
                            /** @default [] */
                            files: {
                                id: string;
                                fileId: string;
                                thumbnailFileId: string | null;
                                position: number;
                                caption: string | null;
                            }[];
                            transcript: string | null;
                            title: string | null;
                            summary: string | null;
                            durationSec: number | null;
                            language: string | null;
                            transcribeProvider: string | null;
                            transcribedAt: string | null;
                            /** @enum {string|null} */
                            source: "typed" | "voice" | "camera" | "gallery" | "upload" | null;
                            /** @default {} */
                            meta: {
                                [key: string]: unknown;
                            };
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{note}/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    note: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        files: {
                            fileId: string;
                            thumbnailFileId?: string | null;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Files appended. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            files: {
                                id: string;
                                fileId: string;
                                thumbnailFileId: string | null;
                                position: number;
                                caption: string | null;
                            }[];
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Note not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{note}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    note: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found or not author. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    note: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        body?: string | null;
                        title?: string | null;
                        summary?: string | null;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            reportId: string;
                            authorId: string;
                            /** @enum {string} */
                            kind: "text" | "voice" | "image" | "document";
                            body: string | null;
                            fileId: string | null;
                            thumbnailFileId: string | null;
                            /** @default [] */
                            files: {
                                id: string;
                                fileId: string;
                                thumbnailFileId: string | null;
                                position: number;
                                caption: string | null;
                            }[];
                            transcript: string | null;
                            title: string | null;
                            summary: string | null;
                            durationSec: number | null;
                            language: string | null;
                            transcribeProvider: string | null;
                            transcribedAt: string | null;
                            /** @enum {string|null} */
                            source: "typed" | "voice" | "camera" | "gallery" | "upload" | null;
                            /** @default {} */
                            meta: {
                                [key: string]: unknown;
                            };
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found or not author. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/files/presign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        scope: "project";
                        projectId: string;
                        reportId: string;
                        /** @enum {string} */
                        kind: "voice" | "image" | "document" | "pdf";
                        contentType: string;
                        sizeBytes: number;
                    } | {
                        /** @enum {string} */
                        scope: "avatar";
                        contentType: string;
                        sizeBytes: number;
                    } | {
                        /** @enum {string} */
                        scope: "scratch";
                        /** @enum {string} */
                        kind: "voice" | "image" | "document" | "pdf";
                        contentType: string;
                        sizeBytes: number;
                    };
                };
            };
            responses: {
                /** @description Presigned upload URL. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uri */
                            uploadUrl: string;
                            fileKey: string;
                            fileId: string;
                            expiresAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Project / report not found or not a member. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        scope: "project";
                        projectId: string;
                        reportId: string;
                        /** @enum {string} */
                        kind: "voice" | "image" | "document" | "pdf";
                        fileKey: string;
                        sizeBytes: number;
                        contentType: string;
                    } | {
                        /** @enum {string} */
                        scope: "avatar";
                        fileKey: string;
                        sizeBytes: number;
                        contentType: string;
                    } | {
                        /** @enum {string} */
                        scope: "scratch";
                        /** @enum {string} */
                        kind: "voice" | "image" | "document" | "pdf";
                        fileKey: string;
                        sizeBytes: number;
                        contentType: string;
                    };
                };
            };
            responses: {
                /** @description Created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            ownerId: string;
                            /** @enum {string} */
                            kind: "voice" | "image" | "document" | "pdf";
                            fileKey: string;
                            sizeBytes: number;
                            contentType: string;
                            projectId: string | null;
                            reportId: string | null;
                            createdAt: string;
                        };
                    };
                };
                /** @description Bad request — fileKey shape / scope mismatch. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Project / report not found or not a member. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Conflict — upload lease missing, mismatched, or already consumed. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{id}/url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Signed GET URL. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uri */
                            url: string;
                            expiresAt: string;
                            sizeBytes?: number;
                            contentType?: string;
                            createdAt?: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Not found or not visible. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/{report}/notes/voice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    report: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        fileId: string;
                        language?: string;
                        durationSec?: number;
                        fixtureName?: string;
                    };
                };
            };
            responses: {
                /** @description Voice note created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            reportId: string;
                            authorId: string;
                            /** @enum {string} */
                            kind: "text" | "voice" | "image" | "document";
                            body: string | null;
                            fileId: string | null;
                            thumbnailFileId: string | null;
                            /** @default [] */
                            files: {
                                id: string;
                                fileId: string;
                                thumbnailFileId: string | null;
                                position: number;
                                caption: string | null;
                            }[];
                            transcript: string | null;
                            title: string | null;
                            summary: string | null;
                            durationSec: number | null;
                            language: string | null;
                            transcribeProvider: string | null;
                            transcribedAt: string | null;
                            /** @enum {string|null} */
                            source: "typed" | "voice" | "camera" | "gallery" | "upload" | null;
                            /** @default {} */
                            meta: {
                                [key: string]: unknown;
                            };
                            createdAt: string;
                            updatedAt: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Report or file not found / not owned. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Recording too long. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Upstream AI provider error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/voice/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        fileId: string;
                        fixtureName?: string;
                    };
                };
            };
            responses: {
                /** @description Transcript. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            transcript: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description File not found or not owned. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Upstream AI provider error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/voice/summarize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        transcript: string;
                        fixtureName?: string;
                    };
                };
            };
            responses: {
                /** @description Summary. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            summary: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Upstream AI provider error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/ai": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current AI settings. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string|null} */
                            vendor: "openai" | null;
                            model: string | null;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string|null} */
                        vendor: "openai" | null;
                        model: string | null;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string|null} */
                            vendor: "openai" | null;
                            model: string | null;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                                details?: unknown;
                                requestId?: string;
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/admin/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Dedicated admin session created. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            authenticated: true;
                            email: string;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Invalid credentials. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Untrusted browser origin. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Request body exceeds 8 KiB. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current dedicated admin session. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            authenticated: true;
                            email: string;
                        };
                    };
                };
                /** @description No valid admin session. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Admin session revoked. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            authenticated: false;
                        };
                    };
                };
                /** @description No valid admin session. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Untrusted browser origin. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                    level?: ("milestone" | "detail") | "all";
                    eventType?: "user.signed_up" | "project.created" | "report.created" | "note.text_created" | "note.voice_created" | "note.image_created" | "note.document_created";
                    actorUserId?: string;
                    excludeActorUserIds?: string;
                    projectId?: string;
                    from?: string;
                    to?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Paginated business activity, newest first. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: ({
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "milestone";
                                /** @enum {string} */
                                eventType: "user.signed_up";
                                /** @enum {string} */
                                subjectType: "user";
                                subjectId: string | null;
                                projectId: unknown;
                                metadata: {
                                    /** @enum {string} */
                                    method: "email_otp";
                                };
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "milestone";
                                /** @enum {string} */
                                eventType: "project.created";
                                /** @enum {string} */
                                subjectType: "project";
                                subjectId: string;
                                projectId: string;
                                metadata: Record<string, never>;
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "milestone";
                                /** @enum {string} */
                                eventType: "report.created";
                                /** @enum {string} */
                                subjectType: "report";
                                subjectId: string;
                                projectId: string;
                                metadata: {
                                    reportNumber: number;
                                };
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "detail";
                                /** @enum {string} */
                                eventType: "note.text_created";
                                /** @enum {string} */
                                subjectType: "note";
                                subjectId: string;
                                projectId: string;
                                metadata: Record<string, never>;
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "detail";
                                /** @enum {string} */
                                eventType: "note.voice_created";
                                /** @enum {string} */
                                subjectType: "note";
                                subjectId: string;
                                projectId: string;
                                metadata: Record<string, never>;
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "detail";
                                /** @enum {string} */
                                eventType: "note.image_created";
                                /** @enum {string} */
                                subjectType: "note";
                                subjectId: string;
                                projectId: string;
                                metadata: Record<string, never>;
                            } | {
                                id: string;
                                occurredAt: string;
                                actorUserId: string | null;
                                actorLabel: string | null;
                                /** Format: email */
                                actorEmail: string | null;
                                /** @enum {string} */
                                actorState: "available" | "deleted";
                                subjectLabel: string | null;
                                /** @enum {string} */
                                subjectState: "available" | "deleted";
                                projectLabel: string | null;
                                /** @enum {string} */
                                projectState: "none" | "available" | "deleted";
                                requestId: string | null;
                                /** @enum {string} */
                                level: "detail";
                                /** @enum {string} */
                                eventType: "note.document_created";
                                /** @enum {string} */
                                subjectType: "note";
                                subjectId: string;
                                projectId: string;
                                metadata: Record<string, never>;
                            })[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Bad request. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Unauthorized. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
                /** @description Rate limited. */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: {
                                code: string;
                                message: string;
                            };
                            requestId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
