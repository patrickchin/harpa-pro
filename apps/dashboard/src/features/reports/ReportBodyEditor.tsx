import { useId } from 'react';
import type { reports } from '@harpa/api-contract';

import { dateInputValue, isoDateFromInput, updateReportBody } from './report-body';

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
    <label className="reports-field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          rows={5}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
        />
      )}
    </label>
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
    <div className="reports-repeatable__header">
      <h4>{title}</h4>
      <button
        type="button"
        className="reports-button reports-button--quiet reports-button--danger"
        aria-label={removeLabel}
        onClick={onRemove}
        disabled={disabled}
      >
        Remove
      </button>
    </div>
  );
}

export function ReportBodyEditor({ body, onChange, disabled = false }: ReportBodyEditorProps) {
  const rootId = useId().replaceAll(':', '');
  const change = (update: (draft: reports.ReportBody) => void) => {
    onChange(updateReportBody(body, update));
  };

  return (
    <div className="reports-editor" aria-label="Structured report editor">
      <nav className="reports-section-nav" aria-label="Report sections">
        {[
          ['overview', 'Overview'],
          ['weather', 'Weather'],
          ['workers', 'Workers'],
          ['materials', 'Materials'],
          ['issues', 'Issues'],
          ['next-steps', 'Next steps'],
          ['other-sections', 'Other sections'],
        ].map(([target, label]) => (
          <a key={target} href={`#${rootId}-${target}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="reports-editor__sections">
        <section id={`${rootId}-overview`} aria-labelledby={`${rootId}-overview-heading`}>
          <h3 id={`${rootId}-overview-heading`}>Overview</h3>
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

        <section id={`${rootId}-weather`} aria-labelledby={`${rootId}-weather-heading`}>
          <div className="reports-section-heading">
            <h3 id={`${rootId}-weather-heading`}>Weather</h3>
            {body.weather ? (
              <button
                type="button"
                className="reports-button reports-button--quiet reports-button--danger"
                onClick={() =>
                  change((draft) => {
                    draft.weather = null;
                  })
                }
                disabled={disabled}
              >
                Remove weather
              </button>
            ) : (
              <button
                type="button"
                className="reports-button reports-button--secondary"
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
              </button>
            )}
          </div>
          {body.weather ? (
            <div className="reports-field-grid">
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
            <p className="reports-muted">No weather details recorded.</p>
          )}
        </section>

        <section id={`${rootId}-workers`} aria-labelledby={`${rootId}-workers-heading`}>
          <div className="reports-section-heading">
            <h3 id={`${rootId}-workers-heading`}>Workers</h3>
            <button
              type="button"
              className="reports-button reports-button--secondary"
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
            </button>
          </div>
          {body.workers.map((worker, index) => (
            <div className="reports-repeatable" key={`worker-${index}`}>
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
              <div className="reports-field-grid">
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
          {body.workers.length === 0 ? <p className="reports-muted">No workers recorded.</p> : null}
        </section>

        <section id={`${rootId}-materials`} aria-labelledby={`${rootId}-materials-heading`}>
          <div className="reports-section-heading">
            <h3 id={`${rootId}-materials-heading`}>Materials</h3>
            <button
              type="button"
              className="reports-button reports-button--secondary"
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
            </button>
          </div>
          {body.materials.map((material, index) => (
            <div className="reports-repeatable" key={`material-${index}`}>
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
              <div className="reports-field-grid">
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
            <p className="reports-muted">No materials recorded.</p>
          ) : null}
        </section>

        <section id={`${rootId}-issues`} aria-labelledby={`${rootId}-issues-heading`}>
          <div className="reports-section-heading">
            <h3 id={`${rootId}-issues-heading`}>Issues</h3>
            <button
              type="button"
              className="reports-button reports-button--secondary"
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
            </button>
          </div>
          {body.issues.map((issue, index) => (
            <div className="reports-repeatable" key={`issue-${index}`}>
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
              <div className="reports-field-grid">
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
          {body.issues.length === 0 ? <p className="reports-muted">No issues recorded.</p> : null}
        </section>

        <section id={`${rootId}-next-steps`} aria-labelledby={`${rootId}-next-steps-heading`}>
          <div className="reports-section-heading">
            <h3 id={`${rootId}-next-steps-heading`}>Next steps</h3>
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={() =>
                change((draft) => {
                  draft.nextSteps.push('');
                })
              }
              disabled={disabled}
            >
              Add next step
            </button>
          </div>
          {body.nextSteps.map((step, index) => (
            <div className="reports-inline-row" key={`next-step-${index}`}>
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
              <button
                type="button"
                className="reports-button reports-button--quiet reports-button--danger"
                aria-label={`Remove next step ${index + 1}`}
                onClick={() =>
                  change((draft) => {
                    draft.nextSteps.splice(index, 1);
                  })
                }
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
          {body.nextSteps.length === 0 ? (
            <p className="reports-muted">No next steps recorded.</p>
          ) : null}
        </section>

        <section
          id={`${rootId}-other-sections`}
          aria-labelledby={`${rootId}-other-sections-heading`}
        >
          <div className="reports-section-heading">
            <h3 id={`${rootId}-other-sections-heading`}>Other sections</h3>
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={() =>
                change((draft) => {
                  draft.summarySections.push({ title: '', body: '' });
                })
              }
              disabled={disabled}
            >
              Add other section
            </button>
          </div>
          {body.summarySections.map((section, index) => (
            <div className="reports-repeatable" key={`section-${index}`}>
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
            <p className="reports-muted">No additional sections recorded.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
