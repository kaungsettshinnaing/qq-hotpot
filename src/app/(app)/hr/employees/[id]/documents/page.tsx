import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { uploadDocument, deleteDocument } from "../../actions";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emp = await prisma.employee.findUnique({
    where: { userId: id },
    include: { user: { select: { name: true } }, documents: { orderBy: { uploadedAt: "desc" } } },
  });
  if (!emp) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Documents — {emp.user.name}</h1>

      <form action={uploadDocument} encType="multipart/form-data"
        className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <input type="hidden" name="employeeId" value={emp.userId} />
        <h2 className="font-semibold text-sm">Upload Document</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Document Name</label>
            <input name="name" className="input" placeholder="e.g. Employment Contract" />
          </div>
          <div>
            <label className="label">File</label>
            <input name="file" type="file" required className="input" />
          </div>
        </div>
        <button type="submit" className="btn-brand">Upload</button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm">
        {emp.documents.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">No documents uploaded yet</p>
        ) : (
          <ul className="divide-y text-sm">
            {emp.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <a href={d.filePath} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                    {d.name}
                  </a>
                  <div className="text-xs text-gray-400">{d.uploadedAt.toLocaleDateString()}</div>
                </div>
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="text-xs text-red-500 hover:underline">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
