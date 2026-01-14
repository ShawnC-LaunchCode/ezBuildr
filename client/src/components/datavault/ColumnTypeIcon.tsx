/**
 * Column Type Icon Component
 * Maps column data types to visual icons
 */

import {
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Clock,
  Mail,
  Phone,
  Link,
  FileJson,
  File,
  Link2,
} from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

interface ColumnTypeIconProps {
  type: string;
  className?: string;
}

export function ColumnTypeIcon({ type, className }: ColumnTypeIconProps) {
  const iconProps = {
    className: cn("w-4 h-4", className),
    "aria-label": `${type} column type`,
  };

  switch (type) {
    case "text":
    case "long_text":
      return <Type {...iconProps} />;

    case "number":
    case "auto_number":
      return <Hash {...iconProps} />;

    case "boolean":
    case "yes_no":
      return <ToggleLeft {...iconProps} />;

    case "date":
      return <Calendar {...iconProps} />;

    case "datetime":
      return <Clock {...iconProps} />;

    case "email":
      return <Mail {...iconProps} />;

    case "phone":
      return <Phone {...iconProps} />;

    case "url":
      return <Link {...iconProps} />;

    case "json":
      return <FileJson {...iconProps} />;

    case "file_upload":
      return <File {...iconProps} />;

    case "reference":
      return <Link2 {...iconProps} />;

    default:
      return <Type {...iconProps} />;
  }
}

/**
 * Get color class for column type
 */
export function getColumnTypeColor(type: string): string {
  switch (type) {
    case "text":
    case "long_text":
      return "text-blue-600 dark:text-blue-400";

    case "number":
    case "auto_number":
      return "text-green-600 dark:text-green-400";

    case "boolean":
    case "yes_no":
      return "text-purple-600 dark:text-purple-400";

    case "date":
    case "datetime":
      return "text-orange-600 dark:text-orange-400";

    case "email":
      return "text-pink-600 dark:text-pink-400";

    case "phone":
      return "text-cyan-600 dark:text-cyan-400";

    case "url":
      return "text-indigo-600 dark:text-indigo-400";

    case "json":
      return "text-yellow-600 dark:text-yellow-400";

    case "file_upload":
      return "text-gray-600 dark:text-gray-400";

    case "reference":
      return "text-violet-600 dark:text-violet-400";

    default:
      return "text-muted-foreground";
  }
}

/**
 * Get human-readable type label
 */
export function getColumnTypeLabel(type: string): string {
  switch (type) {
    case "text":
      return "Text";
    case "long_text":
      return "Long Text";
    case "number":
      return "Number";
    case "auto_number":
      return "Auto Number";
    case "boolean":
      return "Boolean";
    case "yes_no":
      return "Yes/No";
    case "date":
      return "Date";
    case "datetime":
      return "Date & Time";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "url":
      return "URL";
    case "json":
      return "JSON";
    case "file_upload":
      return "File";
    case "reference":
      return "Reference";
    default:
      return type;
  }
}
