// FILE: app/analytics/ChartPlaceholder.tsx
"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChartPlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
                {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
            </CardHeader>
            <CardContent>
                <div className="h-[100px] rounded-xl border border-dashed grid place-items-center text-muted-foreground">
                    chart placeholder
                </div>
            </CardContent>
        </Card>
    );
}
