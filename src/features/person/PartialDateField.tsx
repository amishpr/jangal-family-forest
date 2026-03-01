import { useId } from 'react'
import { MONTHS_LONG } from '../../core/dates'
import type { PartialDate } from '../../core/model'

// A date that can be partial (PLAN P-2): a full date, a month and year, a year only, or "about
// 1920". Three small fields and an "about" box, read back with readPartialDate.

type Props = { name: string; label: string; value?: PartialDate; error?: string }

export function PartialDateField({ name, label, value, error }: Props) {
  const id = useId()
  return (
    <fieldset className="fl" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-describedby={error ? `${id}-err` : undefined}>
      <legend style={{ padding: 0, marginBottom: 4 }}>{label}</legend>
      <div className="three">
        <select className="field-in" name={`${name}.month`} defaultValue={value?.month ?? ''} aria-label={`${label}: month`}>
          <option value="">Month</option>
          {MONTHS_LONG.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="field-in num"
          name={`${name}.day`}
          defaultValue={value?.day ?? ''}
          inputMode="numeric"
          placeholder="Day"
          aria-label={`${label}: day`}
          aria-invalid={!!error}
          maxLength={2}
        />
        <input
          className="field-in num"
          name={`${name}.year`}
          defaultValue={value?.year ?? ''}
          inputMode="numeric"
          placeholder="Year"
          aria-label={`${label}: year`}
          aria-invalid={!!error}
          maxLength={4}
        />
      </div>
      <label className="check" style={{ fontWeight: 600, fontSize: 12.5, marginTop: 4 }}>
        <input type="checkbox" name={`${name}.approx`} defaultChecked={!!value?.approx} />
        About (not exact)
      </label>
      {error && (
        <span className="field-err" id={`${id}-err`}>
          {error}
        </span>
      )}
    </fieldset>
  )
}
