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
    "/auth/otp/start": {
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
                        phone: string;
                    };
                };
            };
            responses: {
                /** @description OTP sent. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            verificationId: string;
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
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/otp/verify": {
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
                        phone: string;
                        code: string;
                    };
                };
            };
            responses: {
                /** @description Verified. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token: string;
                            user: {
                                id: string;
                                phone: string;
                                displayName: string | null;
                                companyName: string | null;
                                createdAt: string;
                            };
                        };
                    };
                };
                /** @description Invalid code. */
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
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
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
                /** @description Logged out. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
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
            };
        };
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
                                phone: string;
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
                                phone: string;
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
                                phone: string;
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
                        phone: string;
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
                            phone: string;
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
                            phone: string;
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
                                    visitDate: string | null;
                                    weather: {
                                        condition: string | null;
                                        temperatureC: number | null;
                                        windKph: number | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: number;
                                        hours: number | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: number | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        /** @enum {string} */
                                        severity: "low" | "medium" | "high";
                                        description: string | null;
                                        action: string | null;
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                generatedAt: string | null;
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
                                visitDate: string | null;
                                weather: {
                                    condition: string | null;
                                    temperatureC: number | null;
                                    windKph: number | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: number;
                                    hours: number | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: number | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    /** @enum {string} */
                                    severity: "low" | "medium" | "high";
                                    description: string | null;
                                    action: string | null;
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            generatedAt: string | null;
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
                                visitDate: string | null;
                                weather: {
                                    condition: string | null;
                                    temperatureC: number | null;
                                    windKph: number | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: number;
                                    hours: number | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: number | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    /** @enum {string} */
                                    severity: "low" | "medium" | "high";
                                    description: string | null;
                                    action: string | null;
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            generatedAt: string | null;
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
                            visitDate: string | null;
                            weather: {
                                condition: string | null;
                                temperatureC: number | null;
                                windKph: number | null;
                                impact: string | null;
                            } | null;
                            workers: {
                                role: string;
                                count: number;
                                hours: number | null;
                                notes: string | null;
                            }[];
                            materials: {
                                name: string;
                                quantity: number | null;
                                unit: string | null;
                                status: string | null;
                                condition: string | null;
                                notes: string | null;
                            }[];
                            issues: {
                                title: string;
                                /** @enum {string} */
                                severity: "low" | "medium" | "high";
                                description: string | null;
                                action: string | null;
                            }[];
                            nextSteps: string[];
                            summarySections: {
                                title: string;
                                body: string;
                            }[];
                        } | null;
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
                                visitDate: string | null;
                                weather: {
                                    condition: string | null;
                                    temperatureC: number | null;
                                    windKph: number | null;
                                    impact: string | null;
                                } | null;
                                workers: {
                                    role: string;
                                    count: number;
                                    hours: number | null;
                                    notes: string | null;
                                }[];
                                materials: {
                                    name: string;
                                    quantity: number | null;
                                    unit: string | null;
                                    status: string | null;
                                    condition: string | null;
                                    notes: string | null;
                                }[];
                                issues: {
                                    title: string;
                                    /** @enum {string} */
                                    severity: "low" | "medium" | "high";
                                    description: string | null;
                                    action: string | null;
                                }[];
                                nextSteps: string[];
                                summarySections: {
                                    title: string;
                                    body: string;
                                }[];
                            } | null;
                            notesSinceLastGeneration: number;
                            generatedAt: string | null;
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
                /** @description Report is finalized. */
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
                                    visitDate: string | null;
                                    weather: {
                                        condition: string | null;
                                        temperatureC: number | null;
                                        windKph: number | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: number;
                                        hours: number | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: number | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        /** @enum {string} */
                                        severity: "low" | "medium" | "high";
                                        description: string | null;
                                        action: string | null;
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                generatedAt: string | null;
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
                                    visitDate: string | null;
                                    weather: {
                                        condition: string | null;
                                        temperatureC: number | null;
                                        windKph: number | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: number;
                                        hours: number | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: number | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        /** @enum {string} */
                                        severity: "low" | "medium" | "high";
                                        description: string | null;
                                        action: string | null;
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                generatedAt: string | null;
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
            requestBody?: never;
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
                                    visitDate: string | null;
                                    weather: {
                                        condition: string | null;
                                        temperatureC: number | null;
                                        windKph: number | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: number;
                                        hours: number | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: number | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        /** @enum {string} */
                                        severity: "low" | "medium" | "high";
                                        description: string | null;
                                        action: string | null;
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                generatedAt: string | null;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
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
            requestBody?: never;
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
                                    visitDate: string | null;
                                    weather: {
                                        condition: string | null;
                                        temperatureC: number | null;
                                        windKph: number | null;
                                        impact: string | null;
                                    } | null;
                                    workers: {
                                        role: string;
                                        count: number;
                                        hours: number | null;
                                        notes: string | null;
                                    }[];
                                    materials: {
                                        name: string;
                                        quantity: number | null;
                                        unit: string | null;
                                        status: string | null;
                                        condition: string | null;
                                        notes: string | null;
                                    }[];
                                    issues: {
                                        title: string;
                                        /** @enum {string} */
                                        severity: "low" | "medium" | "high";
                                        description: string | null;
                                        action: string | null;
                                    }[];
                                    nextSteps: string[];
                                    summarySections: {
                                        title: string;
                                        body: string;
                                    }[];
                                } | null;
                                notesSinceLastGeneration: number;
                                generatedAt: string | null;
                                finalizedAt: string | null;
                                pdfUrl: string | null;
                                createdAt: string;
                                updatedAt: string;
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
                                transcript: string | null;
                                summary?: string | null;
                                durationSec?: number | null;
                                language?: string | null;
                                transcribeProvider?: string | null;
                                transcribedAt?: string | null;
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
                        transcript?: string | null;
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
                            transcript: string | null;
                            summary?: string | null;
                            durationSec?: number | null;
                            language?: string | null;
                            transcribeProvider?: string | null;
                            transcribedAt?: string | null;
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
                        body: string | null;
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
                            transcript: string | null;
                            summary?: string | null;
                            durationSec?: number | null;
                            language?: string | null;
                            transcribeProvider?: string | null;
                            transcribedAt?: string | null;
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
                            createdAt: string;
                        };
                    };
                };
                /** @description Bad request — fileKey must start with users/<callerId>/. */
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
                /** @description Conflict — fileKey already registered. */
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
                /** @description Not found or not owned. */
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
                            transcript: string | null;
                            summary?: string | null;
                            durationSec?: number | null;
                            language?: string | null;
                            transcribeProvider?: string | null;
                            transcribedAt?: string | null;
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
                            /** @enum {string} */
                            vendor: "kimi" | "openai";
                            model: string;
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
                        /** @enum {string} */
                        vendor?: "kimi" | "openai";
                        model?: string;
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
                            /** @enum {string} */
                            vendor: "kimi" | "openai";
                            model: string;
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
