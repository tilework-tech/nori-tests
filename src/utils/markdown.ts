const STATUS_INSTRUCTIONS = `

---

## Test Completion Instructions

When you have completed the task above, you MUST write a status file to indicate success or failure.

**Status file path:** \`{{STATUS_FILE_PATH}}\`

**Format (JSON):**
\`\`\`json
{
  "status": "success"
}
\`\`\`

Or if the task failed:
\`\`\`json
{
  "status": "failure",
  "error": "Description of what went wrong"
}
\`\`\`

**Important:**
- The \`status\` field MUST be either \`"success"\` or \`"failure"\`
- The \`error\` field is optional but recommended when status is \`"failure"\`
- Write the file using: \`echo '{"status": "success"}' > {{STATUS_FILE_PATH}}\`
- Do NOT proceed with any other tasks after writing the status file
`;

export function appendStatusInstructions(
  markdown: string,
  statusFilePath: string,
): string {
  const instructions = STATUS_INSTRUCTIONS.replace(
    /\{\{STATUS_FILE_PATH\}\}/g,
    statusFilePath,
  );
  return markdown + instructions;
}
