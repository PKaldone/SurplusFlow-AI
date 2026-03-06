"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyCase } from "@/lib/hooks/use-portal";
import { apiFetch } from "@/lib/api";

const DOC_TYPES = [
  { value: "id_proof", label: "Government ID (Proof of Identity)" },
  { value: "ssn_card", label: "Social Security Card" },
  { value: "deed", label: "Deed / Property Document" },
  { value: "contract", label: "Signed Contract" },
  { value: "disclosure", label: "Disclosure Form" },
  { value: "other", label: "Other" },
];

export default function DocumentUploadPage() {
  const params = useParams();
  const id = String(params.id);
  const { caseData, isLoading, mutate } = useMyCase(id);

  const [docType, setDocType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = caseData?.documents ?? [];

  async function handleUpload() {
    if (!selectedFile || !docType) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const fileBase64 = await fileToBase64(selectedFile);

      await apiFetch(`/api/v1/portal/my-cases/${id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          docType,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          fileBase64,
        }),
      });

      setUploadSuccess(`"${selectedFile.name}" uploaded successfully!`);
      setSelectedFile(null);
      setDocType("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (data:...;base64,)
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/cases/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Case Details
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Upload Documents</h1>
        <p className="text-muted-foreground mt-1">
          {caseData
            ? `Case ${String(caseData.caseNumber ?? caseData.case_number ?? id)}`
            : `Case ${id}`}
        </p>
      </div>

      {/* Upload Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Upload a Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              Please upload clear photos or scans of the requested documents.
              Accepted formats include PDF, JPG, and PNG. Maximum file size is 10 MB.
            </p>
          </div>

          {uploadSuccess && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {uploadSuccess}
            </div>
          )}

          {uploadError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type..." />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>
                    {dt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>File</Label>
            <div className="border-2 border-dashed border-input rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.tiff,.tif"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                {selectedFile ? (
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click to choose a file, or drag and drop
                  </p>
                )}
              </label>
            </div>
          </div>

          <Button
            onClick={handleUpload}
            disabled={!docType || !selectedFile || uploading}
            className="w-full sm:w-auto"
          >
            {uploading ? (
              <>Uploading...</>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No documents have been uploaded yet for this case.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc: Record<string, unknown>, i: number) => (
                <div
                  key={String(doc.id ?? i)}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {String(doc.filename ?? doc.name ?? `Document ${i + 1}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DOC_TYPES.find((dt) => dt.value === (doc.docType ?? doc.doc_type))?.label ??
                          String(doc.docType ?? doc.doc_type ?? "Document")}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    status={String(
                      doc.verificationStatus ?? doc.verification_status ?? doc.status ?? "uploaded",
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
