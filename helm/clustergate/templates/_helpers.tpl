{{/*
Expand the name of the chart.
*/}}
{{- define "clustergate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "clustergate.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "clustergate.labels" -}}
helm.sh/chart: {{ include "clustergate.chart" . }}
{{ include "clustergate.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "clustergate.selectorLabels" -}}
app.kubernetes.io/name: {{ include "clustergate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend image
*/}}
{{- define "clustergate.backend.image" -}}
{{- with .Values.backend.image }}
{{- if $.Values.global.imageRegistry }}
{{- printf "%s/%s:%s" $.Values.global.imageRegistry .repository .tag }}
{{- else }}
{{- printf "%s:%s" .repository .tag }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Frontend image
*/}}
{{- define "clustergate.frontend.image" -}}
{{- with .Values.frontend.image }}
{{- if $.Values.global.imageRegistry }}
{{- printf "%s/%s:%s" $.Values.global.imageRegistry .repository .tag }}
{{- else }}
{{- printf "%s:%s" .repository .tag }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "clustergate.databaseUrl" -}}
{{- printf "postgresql://%s:%s@%s-postgres:%s/%s?schema=public" .Values.postgres.credentials.username .Values.postgres.credentials.password (include "clustergate.name" .) (toString .Values.postgres.service.port) .Values.postgres.credentials.database }}
{{- end }}
