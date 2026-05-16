/**
 * CharacterEntityMergePage — Page wrapper for the Character Entity Merge admin panel.
 * Route: /projects/:id/character-merge
 *
 * Expects to be rendered inside ProjectShell.
 */
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterEntityMergePanel } from "@/components/admin/CharacterEntityMergePanel";

export default function CharacterEntityMergePage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No project ID provided.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <CharacterEntityMergePanel projectId={id} />
        </CardContent>
      </Card>
    </div>
  );
}