import {
	AbstractDataType,
	DataType,
	ModelAttributeColumnOptions,
	ModelAttributeColumnReferencesOptions,
	ModelOptions
}                     from 'sequelize';
import { decamelize } from 'humps';
import { Diff }       from 'deep-diff';

export interface IAction {
	actionType:
		| 'createTable'
		| 'addIndex'
		| 'addColumn'
		| 'dropTable'
		| 'removeColumn'
		| 'removeIndex'
		| 'changeColumn';
	tableName: string;
	attributes?: IRecord;
	attributeName?: string;
	options?: Partial<ModelAttributeColumnOptions & { indexName?: string }>;
	columnName?: any;
	fields?: any[];
	depends: string[];
}

export interface IDefaultReverseResult {
	value: string;
	internal?: boolean;
	notSupported?: boolean;
}

export interface IMigrationOptions {
	/**
	 * directory where migration file saved. We recommend that you specify this path to sequelize migration path.
	 */
	outDir: string;
	/**
	 * if true, it doesn't generate files but just prints result action.
	 */
	preview?: boolean;
	/**
	 * migration file name, default is "migration"
	 */
	filename?: string;
	/**
	 * comment of migration.
	 */
	comment?: string;
	debug?: boolean;
}

export interface IMigrationState {
	revision?: number;
	version?: number;
	tables: ITableRecord;
}

export interface IRecord<T = any> {
	[k: string]: T;
}

export interface IPropertyRecord<T = any> {
	[k: string]: IRecord<T>;
}

export interface ITable {
	tableName?: string;
	schema?: IRecord<ModelAttributeColumnOptions>;
	references?: ModelAttributeColumnReferencesOptions;
	indexes?: { [k: string]: IRecord };
	fields?: any[];
	options?: ModelOptions;
}

export interface ITableRecord {
	[k: string]: ITable;
}

export type TTableRecordDiff = Diff<ITableRecord>

export interface IDataType
	extends AbstractDataType {
	options?: any;
	type?: DataType;
}

export function refactorColumnName(columnName: string, underscored: boolean) {
	if(underscored) return decamelize(columnName);
	return columnName;
}