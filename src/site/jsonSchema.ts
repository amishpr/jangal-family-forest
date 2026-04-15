import { z } from 'zod'
import { TreeFileSchema } from '../core/schema'

// The backup file's JSON Schema, generated from the same zod schema the importer uses
export function treeFileJsonSchema(url: string) {
  const schema = z.toJSONSchema(TreeFileSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
  return { ...schema, $id: url, title: 'Jangal family tree backup', description: 'A family tree exported from Jangal (.jangal.json)' }
}
