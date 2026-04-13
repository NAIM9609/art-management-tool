# ---------------------------------------------------------------------------
# Shared Variables
# ---------------------------------------------------------------------------

variable "allowed_origins" {
  description = "List of origins allowed to call service HTTP APIs (CORS). Restrict to trusted domains in production."
  type        = list(string)
  default = [
    "https://test.giorgiopriviteralab.com",
    "https://giorgiopriviteralab.com"
  ]
}

variable "admin_username" {
  description = "Admin username for the legacy-compatible API login endpoint."
  type        = string
  default     = "artadmin"
}

variable "admin_password_hash" {
  description = "bcrypt hash for the admin password used by the legacy-compatible API login endpoint."
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = length(trim(var.admin_password_hash)) > 0
    error_message = "admin_password_hash must be set and cannot be empty."
  }

  validation {
    condition     = can(regex("^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$", var.admin_password_hash))
    error_message = "admin_password_hash must be a valid bcrypt hash (for example, one starting with $2b$)."
  }
}
