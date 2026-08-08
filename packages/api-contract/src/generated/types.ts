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
                            csrfToken: string;
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
                            csrfToken: string;
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
    "/admin/operations/neon": {
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
                /** @description Bounded, read-only Neon organization inventory. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            /** @enum {boolean} */
                            projectsTruncated: false;
                            /** @enum {number} */
                            unavailableProjectCount: 0;
                            projects: {
                                id: string;
                                name: string;
                                regionId: string;
                                pgVersion: number;
                                createdAt: string;
                                updatedAt: string;
                                /** @enum {string} */
                                effectivePermission: "VIEWER";
                                branchCount: {
                                    /** @enum {string} */
                                    status: "available";
                                    count: number;
                                };
                                branchDetails: {
                                    /** @enum {string} */
                                    status: "available";
                                    /** @enum {boolean} */
                                    truncated: false;
                                    branches: {
                                        id: string;
                                        name: string;
                                        parentId: string | null;
                                        currentState: string;
                                        default: boolean;
                                        protected: boolean;
                                        createdAt: string;
                                        updatedAt: string;
                                    }[];
                                };
                            }[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "partial";
                            projectsTruncated: boolean;
                            unavailableProjectCount: number;
                            projects: {
                                id: string;
                                name: string;
                                regionId: string;
                                pgVersion: number;
                                createdAt: string;
                                updatedAt: string;
                                /** @enum {string} */
                                effectivePermission: "VIEWER";
                                branchCount: {
                                    /** @enum {string} */
                                    status: "available";
                                    count: number;
                                } | {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_configured" | "unsafe_permissions" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
                                };
                                branchDetails: {
                                    /** @enum {string} */
                                    status: "available";
                                    truncated: boolean;
                                    branches: {
                                        id: string;
                                        name: string;
                                        parentId: string | null;
                                        currentState: string;
                                        default: boolean;
                                        protected: boolean;
                                        createdAt: string;
                                        updatedAt: string;
                                    }[];
                                } | {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_configured" | "unsafe_permissions" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
                                };
                            }[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "unsafe_permissions" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
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
    "/admin/operations/report-generate": {
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
                header: {
                    "X-Admin-CSRF": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Bounded live canary report-generation observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "not_enabled";
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "pass";
                            durationMs: number;
                            target: {
                                /** Format: email */
                                accountEmail: string;
                                projectId: string;
                                reportId: string;
                                reportNumber: number;
                            };
                            generation: {
                                /** @enum {number} */
                                httpStatus: 200;
                                requestId: string | null;
                                durationMs: number;
                                requestedAt: string;
                                finishedAt: string;
                                reportUpdatedAt: string;
                                generatedAt: string;
                                vendor: string;
                                model: string;
                                /** @enum {string} */
                                fixtureMode: "live";
                                /** @enum {boolean} */
                                idempotentReplay: false;
                            };
                            preview: {
                                /** @enum {boolean} */
                                schemaValid: true;
                                sample: {
                                    title: string | null;
                                    summary: string | null;
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
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                };
                                counts: {
                                    workers: number;
                                    materials: number;
                                    issues: number;
                                    nextSteps: number;
                                    summarySections: number;
                                    imageAttachments: number;
                                    documentAttachments: number;
                                };
                                truncated: boolean;
                                bodySha256: string;
                            };
                            usage: {
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                latencyMs: number;
                                /** @enum {boolean} */
                                matched: true;
                            };
                            limits: {
                                /** @enum {string} */
                                plan: "free" | "pro" | "enterprise";
                                reportGenerate: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                                aiInputTokens: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                                aiOutputTokens: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                            };
                            /** @enum {string} */
                            cleanup: "succeeded";
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "warning";
                            durationMs: number;
                            target: {
                                /** Format: email */
                                accountEmail: string;
                                projectId: string;
                                reportId: string;
                                reportNumber: number;
                            };
                            generation: {
                                /** @enum {number} */
                                httpStatus: 200;
                                requestId: string | null;
                                durationMs: number;
                                requestedAt: string;
                                finishedAt: string;
                                reportUpdatedAt: string;
                                generatedAt: string;
                                vendor: string;
                                model: string;
                                /** @enum {string} */
                                fixtureMode: "live";
                                /** @enum {boolean} */
                                idempotentReplay: false;
                            };
                            preview: {
                                /** @enum {boolean} */
                                schemaValid: true;
                                sample: {
                                    title: string | null;
                                    summary: string | null;
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
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                };
                                counts: {
                                    workers: number;
                                    materials: number;
                                    issues: number;
                                    nextSteps: number;
                                    summarySections: number;
                                    imageAttachments: number;
                                    documentAttachments: number;
                                };
                                truncated: boolean;
                                bodySha256: string;
                            };
                            usage: {
                                inputTokens: number;
                                outputTokens: number;
                                cachedTokens: number;
                                latencyMs: number;
                                /** @enum {boolean} */
                                matched: true;
                            };
                            limits: {
                                /** @enum {string} */
                                plan: "free" | "pro" | "enterprise";
                                reportGenerate: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                                aiInputTokens: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                                aiOutputTokens: {
                                    limit: number | null;
                                    used: number;
                                    remaining: number | null;
                                    resetAt: string;
                                    overridden: boolean;
                                };
                            } | null;
                            /** @enum {string} */
                            cleanup: "succeeded" | "failed";
                            warnings: ("limits_unavailable" | "sign_out_failed")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "fail";
                            durationMs: number;
                            /** @enum {string} */
                            phase: "sign_in" | "target_read" | "mode_gate" | "generate" | "proof_read" | "usage_window" | "usage_proof" | "preview" | "limits" | "sign_out";
                            /** @enum {string} */
                            reason: "sign_in_failed" | "target_not_found" | "target_not_draft" | "conflict" | "live_mode_required" | "live_proof_failed" | "usage_proof_missing" | "usage_proof_ambiguous" | "preview_invalid" | "usage_limit_exceeded" | "rate_limited" | "provider_error" | "timeout" | "invalid_response" | "upstream_unavailable";
                            /** @enum {string} */
                            cleanup: "not_started" | "succeeded" | "failed";
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
                /** @description Untrusted origin or invalid CSRF token. */
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
    "/admin/operations/neon-usage": {
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
                /** @description Bounded, read-only Neon Free-plan usage observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            organizationId: string;
                            /** @enum {string} */
                            plan: "free";
                            /** @enum {boolean} */
                            projectsTruncated: false;
                            /** @enum {number} */
                            unavailableProjectCount: 0;
                            projects: {
                                /** @enum {string} */
                                status: "available";
                                id: string;
                                name: string;
                                /** @enum {string} */
                                effectivePermission: "VIEWER";
                                periodStart: string;
                                periodEnd: string;
                                compute: {
                                    used: number;
                                    /** @enum {number} */
                                    allowance: 360000;
                                    /** @enum {string} */
                                    unit: "cu_seconds";
                                };
                                storage: {
                                    used: number;
                                    /** @enum {number} */
                                    allowance: 500000000;
                                    /** @enum {string} */
                                    unit: "bytes";
                                };
                                transferBytes: number;
                            }[];
                            organizationTransfer: {
                                /** @enum {string} */
                                status: "available";
                                periodStart: string;
                                periodEnd: string;
                                used: number;
                                /** @enum {number} */
                                allowance: 5000000000;
                                /** @enum {string} */
                                unit: "bytes";
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "no_projects";
                            };
                            caveats: ("provider_values_may_lag" | "free_plan_published_reference" | "storage_uses_published_reference" | "transfer_requires_complete_project_coverage" | "not_invoice_or_credit_balance" | "published_allowances_can_change")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "partial";
                            organizationId: string;
                            /** @enum {string} */
                            plan: "free";
                            projectsTruncated: boolean;
                            unavailableProjectCount: number;
                            projects: ({
                                /** @enum {string} */
                                status: "available";
                                id: string;
                                name: string;
                                /** @enum {string} */
                                effectivePermission: "VIEWER";
                                periodStart: string;
                                periodEnd: string;
                                compute: {
                                    used: number;
                                    /** @enum {number} */
                                    allowance: 360000;
                                    /** @enum {string} */
                                    unit: "cu_seconds";
                                };
                                storage: {
                                    used: number;
                                    /** @enum {number} */
                                    allowance: 500000000;
                                    /** @enum {string} */
                                    unit: "bytes";
                                };
                                transferBytes: number;
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                id: string;
                                name: string;
                                /** @enum {string} */
                                effectivePermission: "VIEWER";
                                /** @enum {string} */
                                reason: "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
                            })[];
                            organizationTransfer: {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "incomplete_project_coverage" | "period_mismatch" | "invalid_response";
                            };
                            caveats: ("provider_values_may_lag" | "free_plan_published_reference" | "storage_uses_published_reference" | "transfer_requires_complete_project_coverage" | "not_invoice_or_credit_balance" | "published_allowances_can_change")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "unsupported_plan" | "unsafe_permissions" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
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
    "/admin/operations/r2-capacity": {
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
                /** @description Bounded, read-only Cloudflare R2 capacity observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            freeTierReference: {
                                /** @enum {number} */
                                storageGbMonth: 10;
                                /** @enum {number} */
                                classAOperations: 1000000;
                                /** @enum {number} */
                                classBOperations: 10000000;
                                /** @enum {string} */
                                appliesTo: "standard_only";
                            };
                            buckets: {
                                /** @enum {string} */
                                status: "available";
                                /** @enum {boolean} */
                                truncated: false;
                                items: {
                                    name: string;
                                    /** @enum {string} */
                                    jurisdiction: "default" | "eu" | "fedramp" | "unknown";
                                    /** @enum {string|null} */
                                    location: "apac" | "eeur" | "enam" | "weur" | "wnam" | "oc" | null;
                                    /** @enum {string} */
                                    defaultStorageClass: "standard" | "infrequent_access" | "unknown";
                                    createdAt: string | null;
                                }[];
                            };
                            storage: {
                                /** @enum {string} */
                                status: "available";
                                standard: {
                                    publishedPayloadBytes: number;
                                    publishedMetadataBytes: number;
                                    publishedObjects: number;
                                    uploadingPayloadBytes: number;
                                    uploadingMetadataBytes: number;
                                    uploadingObjects: number;
                                };
                                infrequentAccess: {
                                    publishedPayloadBytes: number;
                                    publishedMetadataBytes: number;
                                    publishedObjects: number;
                                    uploadingPayloadBytes: number;
                                    uploadingMetadataBytes: number;
                                    uploadingObjects: number;
                                };
                            };
                            operations: {
                                /** @enum {string} */
                                status: "available";
                                windowStart: string;
                                windowEnd: string;
                                classA: {
                                    estimatedUsed: number;
                                    /** @enum {number} */
                                    publishedAllowance: 1000000;
                                    estimatedRemaining: number;
                                };
                                classB: {
                                    estimatedUsed: number;
                                    /** @enum {number} */
                                    publishedAllowance: 10000000;
                                    estimatedRemaining: number;
                                };
                                freeRequests: number;
                                /** @enum {number} */
                                unclassifiedRequests: 0;
                            };
                            caveats: ("storage_snapshot_not_gb_month" | "storage_metrics_may_lag" | "infrequent_access_not_covered_by_free_tier" | "operations_estimated_from_analytics" | "unclassified_operations_excluded" | "bucket_inventory_truncated")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "partial";
                            freeTierReference: {
                                /** @enum {number} */
                                storageGbMonth: 10;
                                /** @enum {number} */
                                classAOperations: 1000000;
                                /** @enum {number} */
                                classBOperations: 10000000;
                                /** @enum {string} */
                                appliesTo: "standard_only";
                            };
                            buckets: {
                                /** @enum {string} */
                                status: "available";
                                truncated: boolean;
                                items: {
                                    name: string;
                                    /** @enum {string} */
                                    jurisdiction: "default" | "eu" | "fedramp" | "unknown";
                                    /** @enum {string|null} */
                                    location: "apac" | "eeur" | "enam" | "weur" | "wnam" | "oc" | null;
                                    /** @enum {string} */
                                    defaultStorageClass: "standard" | "infrequent_access" | "unknown";
                                    createdAt: string | null;
                                }[];
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "invalid_response" | "provider_unavailable";
                            };
                            storage: {
                                /** @enum {string} */
                                status: "available";
                                standard: {
                                    publishedPayloadBytes: number;
                                    publishedMetadataBytes: number;
                                    publishedObjects: number;
                                    uploadingPayloadBytes: number;
                                    uploadingMetadataBytes: number;
                                    uploadingObjects: number;
                                };
                                infrequentAccess: {
                                    publishedPayloadBytes: number;
                                    publishedMetadataBytes: number;
                                    publishedObjects: number;
                                    uploadingPayloadBytes: number;
                                    uploadingMetadataBytes: number;
                                    uploadingObjects: number;
                                };
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "invalid_response" | "provider_unavailable";
                            };
                            operations: {
                                /** @enum {string} */
                                status: "available";
                                windowStart: string;
                                windowEnd: string;
                                classA: {
                                    estimatedUsed: number;
                                    /** @enum {number} */
                                    publishedAllowance: 1000000;
                                    estimatedRemaining: number;
                                };
                                classB: {
                                    estimatedUsed: number;
                                    /** @enum {number} */
                                    publishedAllowance: 10000000;
                                    estimatedRemaining: number;
                                };
                                freeRequests: number;
                                unclassifiedRequests: number;
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "invalid_response" | "provider_unavailable";
                            };
                            caveats: ("storage_snapshot_not_gb_month" | "storage_metrics_may_lag" | "infrequent_access_not_covered_by_free_tier" | "operations_estimated_from_analytics" | "unclassified_operations_excluded" | "bucket_inventory_truncated")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "invalid_response" | "provider_unavailable";
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
    "/admin/operations/sentry": {
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
                /** @description Bounded, read-only Sentry aggregate issue and mobile session observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            unresolvedErrors: {
                                /** @enum {string} */
                                status: "available";
                                count: number;
                                /** @enum {string} */
                                countKind: "exact" | "lower_bound";
                                /** @enum {number} */
                                cap: 100;
                            };
                            mobileSessions: {
                                /** @enum {string} */
                                status: "available";
                                /** @enum {string} */
                                window: "last_24_hours";
                                windowStart: string;
                                windowEnd: string;
                                totalSessions: number;
                                healthySessions: number;
                                erroredSessions: number;
                                abnormalSessions: number;
                                crashedSessions: number;
                            };
                            caveats: ("issue_groups_not_events" | "mobile_sessions_only" | "telemetry_coverage_applies" | "issue_count_truncated")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "partial";
                            unresolvedErrors: {
                                /** @enum {string} */
                                status: "available";
                                count: number;
                                /** @enum {string} */
                                countKind: "exact" | "lower_bound";
                                /** @enum {number} */
                                cap: 100;
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "not_configured" | "forbidden" | "not_found" | "rate_limited" | "timeout" | "invalid_response" | "provider_unavailable" | "no_session_data";
                            };
                            mobileSessions: {
                                /** @enum {string} */
                                status: "available";
                                /** @enum {string} */
                                window: "last_24_hours";
                                windowStart: string;
                                windowEnd: string;
                                totalSessions: number;
                                healthySessions: number;
                                erroredSessions: number;
                                abnormalSessions: number;
                                crashedSessions: number;
                            } | {
                                /** @enum {string} */
                                status: "unknown";
                                /** @enum {string} */
                                reason: "not_configured" | "forbidden" | "not_found" | "rate_limited" | "timeout" | "invalid_response" | "provider_unavailable" | "no_session_data";
                            };
                            caveats: ("issue_groups_not_events" | "mobile_sessions_only" | "telemetry_coverage_applies" | "issue_count_truncated")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "forbidden" | "not_found" | "rate_limited" | "timeout" | "invalid_response" | "provider_unavailable" | "no_session_data";
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
    "/admin/operations/storage-lifecycle": {
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
                /** @description Bounded, read-only application storage lifecycle observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            rollout: {
                                armedAt: string | null;
                                enforceAfter: string | null;
                                accountDeleteEnabled: boolean;
                                leaseEnforcementActive: boolean;
                                accountDeletionAvailable: boolean;
                                updatedAt: string;
                            };
                            jobs: {
                                total: number;
                                initial: number;
                                final: number;
                                dueNow: number;
                                scheduled: number;
                                activeClaims: number;
                                staleClaims: number;
                                retrying: number;
                                maxAttemptCount: number;
                                oldestDueAt: string | null;
                                nextRunAfter: string | null;
                            };
                            caveats: ("db_state_not_worker_liveness" | "queue_counts_not_provider_health" | "empty_queue_not_execution_proof")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "rollout_state_missing" | "timeout" | "database_unavailable" | "invalid_response";
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
    "/admin/operations/ai-usage": {
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
                /** @description Bounded, read-only Harpa AI usage ledger observation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            /** @enum {string} */
                            source: "harpa_usage_ledger";
                            monthToDate: {
                                windowStart: string;
                                windowEnd: string;
                                recordedEventCount: number;
                                calls: {
                                    live: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                    record: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                    replay: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                };
                                successfulProviderUsage: {
                                    inputTokens: number;
                                    outputTokens: number;
                                    cachedTokens: number;
                                    inputSeconds: number;
                                };
                                operations: {
                                    chat: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                    generateReport: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                    transcribe: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                };
                                providers: {
                                    /** @enum {string} */
                                    provider: "openai" | "groq" | "kimi" | "other";
                                    recordedEventCount: number;
                                    calls: {
                                        live: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                        record: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                        replay: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                    };
                                    successfulProviderUsage: {
                                        inputTokens: number;
                                        outputTokens: number;
                                        cachedTokens: number;
                                        inputSeconds: number;
                                    };
                                    lastRecordedAt: string;
                                }[];
                                unclassifiedVendorEventCount: number;
                                missingInputSecondsEventCount: number;
                                lastRecordedAt: string | null;
                                warnings: ("unclassified_vendor_events" | "missing_transcription_duration")[];
                            };
                            last24Hours: {
                                windowStart: string;
                                windowEnd: string;
                                recordedEventCount: number;
                                calls: {
                                    live: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                    record: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                    replay: {
                                        succeeded: number;
                                        failed: number;
                                        total: number;
                                    };
                                };
                                successfulProviderUsage: {
                                    inputTokens: number;
                                    outputTokens: number;
                                    cachedTokens: number;
                                    inputSeconds: number;
                                };
                                operations: {
                                    chat: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                    generateReport: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                    transcribe: {
                                        liveSucceeded: number;
                                        liveFailed: number;
                                        recordSucceeded: number;
                                        recordFailed: number;
                                        replaySucceeded: number;
                                        replayFailed: number;
                                    };
                                };
                                providers: {
                                    /** @enum {string} */
                                    provider: "openai" | "groq" | "kimi" | "other";
                                    recordedEventCount: number;
                                    calls: {
                                        live: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                        record: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                        replay: {
                                            succeeded: number;
                                            failed: number;
                                            total: number;
                                        };
                                    };
                                    successfulProviderUsage: {
                                        inputTokens: number;
                                        outputTokens: number;
                                        cachedTokens: number;
                                        inputSeconds: number;
                                    };
                                    lastRecordedAt: string;
                                }[];
                                unclassifiedVendorEventCount: number;
                                missingInputSecondsEventCount: number;
                                lastRecordedAt: string | null;
                                warnings: ("unclassified_vendor_events" | "missing_transcription_duration")[];
                            };
                            providerCapacity: {
                                openai: {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_observed";
                                };
                                groq: {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_observed";
                                };
                                kimi: {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_observed";
                                };
                            };
                            caveats: ("best_effort_ledger" | "not_provider_billing" | "replay_not_provider_usage" | "record_mode_calls_provider" | "deleted_history_excluded")[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "schema_unavailable" | "database_unavailable" | "timeout" | "invalid_response";
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
    "/admin/operations/fly-inventory": {
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
                /** @description Bounded, read-only Fly application infrastructure inventory. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            observedAt: string;
                            /** @enum {string} */
                            status: "available";
                            organizationSlug: string;
                            configuredAppCount: number;
                            /** @enum {number} */
                            unavailableConfiguredAppCount: 0;
                            apps: {
                                id: string;
                                name: string;
                                status: string;
                                network: string | null;
                                reportedMachineCount: number;
                                reportedVolumeCount: number;
                                machines: {
                                    /** @enum {string} */
                                    status: "available";
                                    /** @enum {boolean} */
                                    truncated: false;
                                    items: {
                                        id: string;
                                        name: string;
                                        state: string;
                                        processGroup: string | null;
                                        region: string;
                                        cpuKind: string;
                                        cpus: number;
                                        memoryMb: number;
                                        createdAt: string;
                                        updatedAt: string;
                                    }[];
                                };
                                volumes: {
                                    /** @enum {string} */
                                    status: "available";
                                    /** @enum {boolean} */
                                    truncated: false;
                                    returnedAllocatedGb: number;
                                    items: {
                                        id: string;
                                        name: string;
                                        state: string;
                                        sizeGb: number;
                                        region: string;
                                        encrypted: boolean;
                                        attachedMachineId: string | null;
                                        createdAt: string;
                                        snapshotRetentionDays: number | null;
                                        autoBackupEnabled: boolean | null;
                                    }[];
                                };
                            }[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "partial";
                            organizationSlug: string;
                            configuredAppCount: number;
                            unavailableConfiguredAppCount: number;
                            apps: {
                                id: string;
                                name: string;
                                status: string;
                                network: string | null;
                                reportedMachineCount: number;
                                reportedVolumeCount: number;
                                machines: {
                                    /** @enum {string} */
                                    status: "available";
                                    truncated: boolean;
                                    items: {
                                        id: string;
                                        name: string;
                                        state: string;
                                        processGroup: string | null;
                                        region: string;
                                        cpuKind: string;
                                        cpus: number;
                                        memoryMb: number;
                                        createdAt: string;
                                        updatedAt: string;
                                    }[];
                                } | {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
                                };
                                volumes: {
                                    /** @enum {string} */
                                    status: "available";
                                    truncated: boolean;
                                    returnedAllocatedGb: number;
                                    items: {
                                        id: string;
                                        name: string;
                                        state: string;
                                        sizeGb: number;
                                        region: string;
                                        encrypted: boolean;
                                        attachedMachineId: string | null;
                                        createdAt: string;
                                        snapshotRetentionDays: number | null;
                                        autoBackupEnabled: boolean | null;
                                    }[];
                                } | {
                                    /** @enum {string} */
                                    status: "unknown";
                                    /** @enum {string} */
                                    reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
                                };
                            }[];
                        } | {
                            observedAt: string;
                            /** @enum {string} */
                            status: "unknown";
                            /** @enum {string} */
                            reason: "not_configured" | "timeout" | "rate_limited" | "forbidden" | "not_found" | "invalid_response" | "provider_unavailable";
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
