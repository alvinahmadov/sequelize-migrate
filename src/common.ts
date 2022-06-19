import {
	AbstractDataType,
	DataType
}                     from 'sequelize';
import { decamelize } from 'humps';

const DECAMELIZE = true;

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
	attributes?: any;
	attributeName?: any;
	options?: any;
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
	tables: {};
}

export interface IRecord<T = any> {
	[k: string]: T;
}

export interface IPropertyRecord<T = any> {
	[k: string]: IRecord<T>;
}

export interface ITable {
	tableName?: string;
	schema?: any;
	indexes?: { [k: string]: IRecord };
}

export interface ITableRecord {
	[k: string]: ITable;
}

export interface IDataType
	extends AbstractDataType {
	options?: any;
	type?: DataType;
}

export function refactorColumnName(columnName: string) {
	if(DECAMELIZE) return decamelize(columnName);
	return columnName;
}