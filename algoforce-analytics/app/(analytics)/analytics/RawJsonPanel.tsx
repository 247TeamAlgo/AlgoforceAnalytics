"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RawJsonPanel({ title, description, json }: { title: string; description?: string; json: unknown }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
                {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent>
                <pre className="text-xs overflow-auto border rounded p-3 bg-neutral-50 max-h-[48vh]">
                    {json ? JSON.stringify(json, null, 2) : "No data yet. Use the controls above."}
                </pre>
            </CardContent>
        </Card>
    );
}
