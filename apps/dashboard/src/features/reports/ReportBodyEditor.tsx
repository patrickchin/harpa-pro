import { useId } from 'react';
import type { reports } from '@harpa/api-contract';

import { Button, Field as FormField, Input, Textarea } from '@/components/ui';

import { dateInputValue, isoDateFromInput, updateReportBody } from './report-body';

const editorSectionClassName =
  'grid scroll-mt-4 gap-4 rounded-card-ui border border-border bg-card p-4 shadow-raised-ui';
const sectionHeadingClassName = 'flex flex-wrap items-start justify-between gap-3';
const fieldGridClassName = 'grid gap-3 sm:grid-cols-2';
const repeatableCardClassName =
  'grid gap-3 rounded-card-ui border border-border bg-surface-emphasis p-3';
const mutedCopyClassName = 'text-muted-foreground';

export interface ReportBodyEditorProps {
  body: reports.ReportBody;
  onChange: (body: reports.ReportBody) => void;
  disabled?: boolean;
}

function textOrNull(value: string): string | null {
  return value.trim() ? value : null;
}

interface FieldProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  type?: 'text' | 'date';
}

function Field({
  id,
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  type = 'text',
}: FieldProps) {
  return (
    <FormField className="min-w-0" htmlFor={id} label={label}>
      {multiline ? (
        <Textarea
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          rows={5}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
        />
      )}
    </FormField>
  );
}

function RowHeader({
  title,
  removeLabel,
  onRemove,
  disabled,
}: {
  title: string;
  removeLabel: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h4 className="text-body font-bold">{title}</h4>
      <Button
        type="button"
        size="small"
        variant="destructive"
        aria-label={removeLabel}
        onClick={onRemove}
        disabled={disabled}
      >
        Remove
      </Button>
    </div>
  );
}

export function ReportBodyEditor({ body, onChange, disabled = false }: ReportBodyEditorProps) {
  const rootId = useId().replaceAll(':', '');
  const change = (update: (draft: reports.ReportBody) => void) => {
    onChange(updateReportBody(body, update));
  };

  return (
    <div
      className="grid min-w-0 items-start gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]"
      aria-label="Structured report editor"
    >
      <nav
        className="flex min-w-0 gap-1 overflow-x-auto rounded-card-ui border border-border bg-surface-muted p-2 lg:sticky lg:top-4 lg:grid"
        aria-label="Report sections"
      >
        {[
          ['overview', 'Overview'],
          ['weather', 'Weather'],
          ['workers', 'Workers'],
          ['materials', 'Materials'],
          ['issues', 'Issues'],
          ['next-steps', 'Next steps'],
          ['other-sections', 'Other sections'],
        ].map(([target, label]) => (
          <a
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-control-ui px-3 text-meta font-bold text-foreground no-underline hover:bg-card"
            key={target}
            href={`#${rootId}-${target}`}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid min-w-0 gap-4">
        <section
          className={editorSectionClassName}
          id={`${rootId}-overview`}
          aria-labelledby={`${rootId}-overview-heading`}
        >
          <h3 className="text-title-sm font-bold" id={`${rootId}-overview-heading`}>
            Overview
          </h3>
          <Field
            id={`${rootId}-title`}
            label="Report title"
            value={body.meta.title}
            onChange={(value) =>
              change((draft) => {
                draft.meta.title = textOrNull(value);
              })
            }
            disabled={disabled}
          />
          <Field
            id={`${rootId}-visit-date`}
            label="Visit date"
            type="date"
            value={dateInputValue(body.meta.visitDate)}
            onChange={(value) =>
              change((draft) => {
                draft.meta.visitDate = isoDateFromInput(value);
              })
            }
            disabled={disabled}
          />
          <Field
            id={`${rootId}-summary`}
            label="Summary"
            value={body.meta.summary}
            multiline
            onChange={(value) =>
              change((draft) => {
                draft.meta.summary = textOrNull(value);
              })
            }
            disabled={disabled}
          />
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-weather`}
          aria-labelledby={`${rootId}-weather-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-weather-heading`}>
              Weather
            </h3>
            {body.weather ? (
              <Button
                type="button"
                size="small"
                variant="destructive"
                onClick={() =>
                  change((draft) => {
                    draft.weather = null;
                  })
                }
                disabled={disabled}
              >
                Remove weather
              </Button>
            ) : (
              <Button
                type="button"
                size="small"
                variant="secondary"
                onClick={() =>
                  change((draft) => {
                    draft.weather = {
                      condition: null,
                      temperature: null,
                      wind: null,
                      impact: null,
                    };
                  })
                }
                disabled={disabled}
              >
                Add weather
              </Button>
            )}
          </div>
          {body.weather ? (
            <div className={fieldGridClassName}>
              {(
                [
                  ['condition', 'Condition'],
                  ['temperature', 'Temperature'],
                  ['wind', 'Wind'],
                  ['impact', 'Impact'],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  id={`${rootId}-weather-${key}`}
                  label={label}
                  value={body.weather?.[key] ?? null}
                  multiline={key === 'impact'}
                  onChange={(value) =>
                    change((draft) => {
                      if (draft.weather) {
                        draft.weather[key] = textOrNull(value);
                      }
                    })
                  }
                  disabled={disabled}
                />
              ))}
            </div>
          ) : (
            <p className={mutedCopyClassName}>No weather details recorded.</p>
          )}
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-workers`}
          aria-labelledby={`${rootId}-workers-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-workers-heading`}>
              Workers
            </h3>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                change((draft) => {
                  draft.workers.push({
                    role: '',
                    count: null,
                    hours: null,
                    notes: null,
                  });
                })
              }
              disabled={disabled}
            >
              Add worker
            </Button>
          </div>
          {body.workers.map((worker, index) => (
            <div className={repeatableCardClassName} key={`worker-${index}`}>
              <RowHeader
                title={`Worker ${index + 1}`}
                removeLabel={`Remove worker ${index + 1}`}
                onRemove={() =>
                  change((draft) => {
                    draft.workers.splice(index, 1);
                  })
                }
                disabled={disabled}
              />
              <div className={fieldGridClassName}>
                <Field
                  id={`${rootId}-worker-${index}-role`}
                  label={`Worker role ${index + 1}`}
                  value={worker.role}
                  onChange={(value) =>
                    change((draft) => {
                      draft.workers[index]!.role = value;
                    })
                  }
                  disabled={disabled}
                />
                <Field
                  id={`${rootId}-worker-${index}-count`}
                  label={`Worker count ${index + 1}`}
                  value={worker.count}
                  onChange={(value) =>
                    change((draft) => {
                      draft.workers[index]!.count = textOrNull(value);
                    })
                  }
                  disabled={disabled}
                />
                <Field
                  id={`${rootId}-worker-${index}-hours`}
                  label={`Worker hours ${index + 1}`}
                  value={worker.hours}
                  onChange={(value) =>
                    change((draft) => {
                      draft.workers[index]!.hours = textOrNull(value);
                    })
                  }
                  disabled={disabled}
                />
                <Field
                  id={`${rootId}-worker-${index}-notes`}
                  label={`Worker notes ${index + 1}`}
                  value={worker.notes}
                  multiline
                  onChange={(value) =>
                    change((draft) => {
                      draft.workers[index]!.notes = textOrNull(value);
                    })
                  }
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
          {body.workers.length === 0 ? (
            <p className={mutedCopyClassName}>No workers recorded.</p>
          ) : null}
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-materials`}
          aria-labelledby={`${rootId}-materials-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-materials-heading`}>
              Materials
            </h3>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                change((draft) => {
                  draft.materials.push({
                    name: '',
                    quantity: null,
                    unit: null,
                    status: null,
                    condition: null,
                    notes: null,
                  });
                })
              }
              disabled={disabled}
            >
              Add material
            </Button>
          </div>
          {body.materials.map((material, index) => (
            <div className={repeatableCardClassName} key={`material-${index}`}>
              <RowHeader
                title={`Material ${index + 1}`}
                removeLabel={`Remove material ${index + 1}`}
                onRemove={() =>
                  change((draft) => {
                    draft.materials.splice(index, 1);
                  })
                }
                disabled={disabled}
              />
              <div className={fieldGridClassName}>
                {(
                  [
                    ['name', 'Name'],
                    ['quantity', 'Quantity'],
                    ['unit', 'Unit'],
                    ['status', 'Status'],
                    ['condition', 'Condition'],
                    ['notes', 'Notes'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    id={`${rootId}-material-${index}-${key}`}
                    label={`Material ${label.toLowerCase()} ${index + 1}`}
                    value={material[key]}
                    multiline={key === 'notes'}
                    onChange={(value) =>
                      change((draft) => {
                        if (key === 'name') {
                          draft.materials[index]!.name = value;
                        } else {
                          draft.materials[index]![key] = textOrNull(value);
                        }
                      })
                    }
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          ))}
          {body.materials.length === 0 ? (
            <p className={mutedCopyClassName}>No materials recorded.</p>
          ) : null}
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-issues`}
          aria-labelledby={`${rootId}-issues-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-issues-heading`}>
              Issues
            </h3>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                change((draft) => {
                  draft.issues.push({
                    title: '',
                    severity: null,
                    description: null,
                    action: null,
                  });
                })
              }
              disabled={disabled}
            >
              Add issue
            </Button>
          </div>
          {body.issues.map((issue, index) => (
            <div className={repeatableCardClassName} key={`issue-${index}`}>
              <RowHeader
                title={`Issue ${index + 1}`}
                removeLabel={`Remove issue ${index + 1}`}
                onRemove={() =>
                  change((draft) => {
                    draft.issues.splice(index, 1);
                  })
                }
                disabled={disabled}
              />
              <div className={fieldGridClassName}>
                {(
                  [
                    ['title', 'Title'],
                    ['severity', 'Severity'],
                    ['description', 'Description'],
                    ['action', 'Required action'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    id={`${rootId}-issue-${index}-${key}`}
                    label={`Issue ${label.toLowerCase()} ${index + 1}`}
                    value={issue[key]}
                    multiline={key === 'description' || key === 'action'}
                    onChange={(value) =>
                      change((draft) => {
                        if (key === 'title') {
                          draft.issues[index]!.title = value;
                        } else {
                          draft.issues[index]![key] = textOrNull(value);
                        }
                      })
                    }
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          ))}
          {body.issues.length === 0 ? (
            <p className={mutedCopyClassName}>No issues recorded.</p>
          ) : null}
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-next-steps`}
          aria-labelledby={`${rootId}-next-steps-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-next-steps-heading`}>
              Next steps
            </h3>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                change((draft) => {
                  draft.nextSteps.push('');
                })
              }
              disabled={disabled}
            >
              Add next step
            </Button>
          </div>
          {body.nextSteps.map((step, index) => (
            <div
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              key={`next-step-${index}`}
            >
              <Field
                id={`${rootId}-next-step-${index}`}
                label={`Next step ${index + 1}`}
                value={step}
                onChange={(value) =>
                  change((draft) => {
                    draft.nextSteps[index] = value;
                  })
                }
                disabled={disabled}
              />
              <Button
                type="button"
                size="small"
                variant="destructive"
                aria-label={`Remove next step ${index + 1}`}
                onClick={() =>
                  change((draft) => {
                    draft.nextSteps.splice(index, 1);
                  })
                }
                disabled={disabled}
              >
                Remove
              </Button>
            </div>
          ))}
          {body.nextSteps.length === 0 ? (
            <p className={mutedCopyClassName}>No next steps recorded.</p>
          ) : null}
        </section>

        <section
          className={editorSectionClassName}
          id={`${rootId}-other-sections`}
          aria-labelledby={`${rootId}-other-sections-heading`}
        >
          <div className={sectionHeadingClassName}>
            <h3 className="text-title-sm font-bold" id={`${rootId}-other-sections-heading`}>
              Other sections
            </h3>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                change((draft) => {
                  draft.summarySections.push({ title: '', body: '' });
                })
              }
              disabled={disabled}
            >
              Add other section
            </Button>
          </div>
          {body.summarySections.map((section, index) => (
            <div className={repeatableCardClassName} key={`section-${index}`}>
              <RowHeader
                title={`Other section ${index + 1}`}
                removeLabel={`Remove other section ${index + 1}`}
                onRemove={() =>
                  change((draft) => {
                    draft.summarySections.splice(index, 1);
                  })
                }
                disabled={disabled}
              />
              <Field
                id={`${rootId}-section-${index}-title`}
                label={`Other section title ${index + 1}`}
                value={section.title}
                onChange={(value) =>
                  change((draft) => {
                    draft.summarySections[index]!.title = value;
                  })
                }
                disabled={disabled}
              />
              <Field
                id={`${rootId}-section-${index}-body`}
                label={`Other section body ${index + 1}`}
                value={section.body}
                multiline
                onChange={(value) =>
                  change((draft) => {
                    draft.summarySections[index]!.body = value;
                  })
                }
                disabled={disabled}
              />
            </div>
          ))}
          {body.summarySections.length === 0 ? (
            <p className={mutedCopyClassName}>No additional sections recorded.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
