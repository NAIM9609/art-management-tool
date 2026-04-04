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
