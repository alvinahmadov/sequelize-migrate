import crypto        from 'crypto';
import { Sequelize } from 'sequelize-typescript';
import {
	AbstractDataType,
	BlobDataType,
	CharDataType,
	DateDataType,
	DecimalDataType,
	EnumDataType,
	GeometryDataType,
	GeographyDataType,
	NumberDataType,
	StringDataType,
	TextDataType,
	IndexesOptions,
	ModelStatic,
	ModelAttributeColumnOptions,
	Model
}                    from 'sequelize/types';
import {
	IDataType,
	IDefaultReverseResult,
	IPropertyRecord,
	IRecord,
	ITableRecord,
	refactorColumnName
}                    from '../common';

export function parseIndex(idx: IndexesOptions) {
	let result: IRecord = {};
	const indexesOptionsKeys: (keyof IndexesOptions)[] = [
		'name',
		'type',
		'unique',
		'concurrently',
		'fields',
		'using',
		'operator',
		'where'
	];
	indexesOptionsKeys.forEach(
		key =>
		{
			if(idx[key] !== undefined) {
				result[key] = idx[key];
			}
		}
	);

	const options: IRecord = {};

	if(idx.name) {
		options['indexName'] = idx.name;
	} // The name of the index. Default is __

	// @todo: UNIQUE|FULLTEXT|SPATIAL
	if(idx.unique) {
		options['indicesType'] = 'UNIQUE';
	}

	// Set a type for the index, e.g. BTREE. See the documentation of the used dialect
	//   if (idx.method) {
	//     options["indexType"] = idx.type;
	//   }

	if(idx.parser && idx.parser !== '') {
		options['parser'] = idx.parser;
	} // For FULLTEXT columns set your parser

	result['options'] = options;

	//   result["hash"] = hash(idx);
	result['hash'] = crypto
		.createHash('sha1')
		.update(JSON.stringify(idx))
		.digest('hex');

	return result;
}

export function reverseColumnType(
	sequelize: Sequelize,
	attrOptions: IDataType,
	prefix = 'Sequelize.'
): string {
	switch(attrOptions.constructor.name) {
		case 'VIRTUAL':
			return getVirtual(prefix);
		case 'CHAR':
			return getChar(prefix, attrOptions);
		case 'STRING':
			return getString(prefix, attrOptions);
		case 'TEXT':
			return getText(prefix, attrOptions);
		case 'DECIMAL':
			return getDecimal(prefix, attrOptions);
		case 'FLOAT':
			return getFloat(prefix, attrOptions);
		case 'TINYINT':
		case 'SMALLINT':
		case 'MEDIUMINT':
		case 'INTEGER':
		case 'BIGINT':
			return getNumber(prefix, attrOptions);
		case 'DATE':
			return getDate(prefix, attrOptions);
		case 'DATEONLY':
			return getDateOnly(prefix);
		case 'BLOB':
			return getBlob(prefix, attrOptions);
		case 'ENUM':
			return getEnum(prefix, attrOptions);
		case 'GEOMETRY':
			return getGeometry(prefix, attrOptions);
		case 'GEOGRAPHY':
			return getGeography(prefix, attrOptions);
		case 'ARRAY':
			// ARRAY ( PostgreSQL only )
			return getArray(prefix, sequelize, attrOptions);
		case 'RANGE':
			// RANGE ( PostgreSQL only )
			return getRange(prefix, sequelize, attrOptions);
		case 'BOOLEAN':
		case 'TIME':
		case 'HSTORE':
		case 'JSON':
		case 'JSONB':
		case 'NOW':
		case 'UUID':
		case 'UUIDV1':
		case 'UUIDV4':
		case 'CIDR':
		case 'INET':
		case 'MACADDR':
		case 'CITEXT':
			return `${prefix}${attrOptions.constructor.name}`;
		default:
			console.log(`Not supported data type ${attrOptions.constructor.name}...`);
			return getVirtual(prefix);
	}
}

export function reverseDefaultValueType(
	defaultValue: any,
	prefix: string = 'Sequelize.'
): IDefaultReverseResult {
	if(defaultValue.constructor.name == 'NOW') {
		return {
			internal: true,
			value:    `${prefix}NOW`
		};
	}

	if(defaultValue.constructor.name == 'UUIDV1') {
		return {
			internal: true,
			value:    `${prefix}UUIDV1`
		};
	}

	if(defaultValue.constructor.name == 'UUIDV4') {
		return {
			internal: true,
			value:    `${prefix}UUIDV4`
		};
	}

	if(typeof defaultValue?.fn !== 'undefined') {
		return {
			internal: true,
			value:    `${prefix}fn('${defaultValue.fn}')`
		};
	}

	if(typeof defaultValue === 'function') {
		const retValue = defaultValue();
		if(retValue && retValue.val) {
			return {
				internal: true,
				value:    `${prefix}literal(\'${retValue.val}\')`
			};
		}
		return { notSupported: true, value: '' };
	}

	return { value: defaultValue };
}

export function reverseModels(
	sequelize: Sequelize,
	models: { [key: string]: ModelStatic<Model>; }
): ITableRecord {
	const tables: ITableRecord = {};
	for(let [, model] of Object.entries(models)) {
		const resultAttributes: IRecord = {};
		const { sequelize: _, ...initOptions } = model.options;

		for(let [column, attribute] of Object.entries(model.getAttributes())) {
			let rowAttribute: IRecord<string | IDefaultReverseResult> = {};
			column = refactorColumnName(column, initOptions.underscored);

			if(attribute.defaultValue) {
				const _val = reverseDefaultValueType(attribute.defaultValue);
				if(_val.notSupported) {
					console.log(
						`[Not supported] Skip defaultValue column of attribute ${model.name}:${column}`
					);
					continue;
				}
				rowAttribute['defaultValue'] = _val;
			}

			if(attribute.type === undefined) {
				console.log(
					`[Not supported] Skip column with undefined type ${model.name}:${column}`
				);
				continue;
			}

			const seqType: string = reverseColumnType(
				sequelize,
				attribute.type as AbstractDataType
			);
			if(seqType === 'Sequelize.VIRTUAL') {
				console.log(
					`[SKIP] Skip Sequelize.VIRTUAL column "${column}"", defined in model "${model.name}"`
				);
				continue;
			}

			rowAttribute = Object.assign(rowAttribute, { seqType });
			const optionKeys: (keyof ModelAttributeColumnOptions)[] = [
				'allowNull',
				'unique',
				'primaryKey',
				'autoIncrement',
				'autoIncrementIdentity',
				'comment',
				'defaultValue',
				'references',
				'onUpdate',
				'onDelete',
				'validate'
			];
			optionKeys.forEach(key =>
			                   {
				                   if(attribute[key] !== undefined &&
				                      typeof attribute[key] !== 'function') {
					                   rowAttribute[key] = attribute[key] as string;
				                   }
			                   });

			resultAttributes[column] = rowAttribute;
		} // attributes in model

		tables[model.tableName] = {
			tableName: model.tableName,
			schema:    resultAttributes,
			options:   initOptions
		};

		let idx_out: IPropertyRecord = {};
		if(model.options.indexes.length > 0) {
			for(const _i in model.options.indexes) {
				const index = parseIndex(model.options.indexes[_i]);
				idx_out[`${index['hash']}`] = index;
				delete index['hash'];
			}
		}
		tables[model.tableName].indexes = idx_out;
	} // model in models

	return tables;
}

// Type util functions

export function getVirtual(prefix: string) {
	return `${prefix}VIRTUAL`;
}

export function getDateOnly(prefix: string) {
	return `${prefix}DATEONLY`;
}

export function getChar(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as CharDataType;
	if(!dataType?.options) {
		return `${prefix}CHAR`;
	}
	const postfix = dataType.options.binary ? '.BINARY' : '';
	return `${prefix}CHAR${postfix}`;
}

export function getString(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as StringDataType;

	if(dataType?.options === undefined) {
		return `${prefix}STRING`;
	}

	if(dataType.options.binary !== undefined) {
		return `${prefix}STRING.BINARY`;
	}
	const length =
		dataType.options.length !== undefined
		? `(${dataType.options.length})`
		: '';
	return `${prefix}STRING${length}`;
}

export function getText(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as TextDataType;
	if(!dataType?.options.length) {
		return `${prefix}TEXT`;
	}
	const postfix = `('${dataType.options.length.toLowerCase()}')`;
	return `${prefix}TEXT(${postfix})`;
}

export function getFloat(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as DecimalDataType;
	const params = [];

	if(dataType?.options?.precision) {
		params.push(dataType.options.precision);
	}
	if(dataType?.options?.scale) {
		params.push(dataType.options.scale);
	}
	const postfix = params.length > 0 ? `(${params.join(',')})` : '';
	return `${prefix}FLOAT${postfix}`;
}

export function getDecimal(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as DecimalDataType;
	const params = [];

	if(dataType?.options?.precision) {
		params.push(dataType.options.precision);
	}
	if(dataType?.options?.scale) {
		params.push(dataType.options.scale);
	}
	const postfix = params.length > 0 ? `(${params.join(',')})` : '';
	return `${prefix}DECIMAL${postfix}`;
}

export function getNumber(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as NumberDataType;
	const params: any[] = [];

	if(dataType) {
		if(dataType.options?.length) {
			params.push(dataType.options.length);
		}
		if(dataType.options?.decimals) {
			params.push(dataType.options.decimals);
		}
		let postfix = params.length > 0 ? `(${params.join(',')})` : '';

		if(dataType.options?.zerofill) {
			postfix += '.ZEROFILL';
		}

		if(dataType.options?.unsigned) {
			postfix += '.UNSIGNED';
		}
		return `${prefix}${dataType.key}${postfix}`;
	}

	return `${prefix}${attribute.key}`;
}

export function getDate(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as DateDataType;
	const length = dataType?.options?.length
	               ? `(${dataType.options.length})`
	               : '';
	return `${prefix}DATE${length}`;
}

export function getBlob(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as BlobDataType;
	const postfix = `(${dataType?.options.length.toLowerCase()})`;
	return `${prefix}BLOB(${postfix})`;
}

export function getEnum(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as EnumDataType<any>;
	return `${prefix}ENUM('${dataType.options.values.join('\', \'')}')`;
}

export function getGeometry(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as GeometryDataType;
	if(dataType?.options.type == undefined) {
		return `${prefix}GEOMETRY`;
	}
	const type = dataType.options.type.toUpperCase();
	const srid = dataType.options.srid;
	const postfixItems = [`'${type}'`];
	if(srid !== undefined) {
		postfixItems.push(dataType.options.srid.toString());
	}
	return `${prefix}GEOMETRY(${postfixItems.join(',')})`;
}

export function getGeography(prefix: string, attribute?: IDataType) {
	const dataType = attribute.type as GeographyDataType;
	if(dataType?.options.type == undefined) {
		return `${prefix}GEOGRAPHY`;
	}
	const type = dataType.options.type.toUpperCase();
	const srid = dataType.options.srid;
	const postfixItems = [`'${type}'`];
	if(srid !== undefined) {
		postfixItems.push(dataType.options.srid.toString());
	}
	return `${prefix}GEOGRAPHY(${postfixItems.join(',')})`;
}

export function getArray(prefix: string, sequelize: Sequelize, attribute?: IDataType) {
	const dataType = attribute.type as IDataType;
	const innerType = reverseColumnType(sequelize, dataType);
	return `${prefix}ARRAY(${innerType})`;
}

export function getRange(prefix: string, sequelize: Sequelize, attribute?: IDataType) {
	const dataType = attribute.type as IDataType;
	const innerType = reverseColumnType(sequelize, dataType);
	return `${prefix}RANGE(${innerType})`;
}