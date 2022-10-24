import * as df from 'deep-diff';
import {
	IAction,
	ITable,
	ITableRecord,
	TTableRecordDiff
}              from '../common';
import {
	ModelAttributeColumnOptions
}              from 'sequelize';
import {
	ModelAttributeColumnReferencesOptions
}              from 'sequelize/types/model';

function addNew(df: df.DiffNew<ITable>, actions: IAction[], currentStateTables: ITableRecord): void {
	// new table created
	if(df.path?.length === 1) {
		const depends: string[] = [];

		const tableName = df.rhs.tableName;
		if(df.rhs.schema)
		Object.values(df.rhs.schema)
		      .forEach((v) =>
		               {
			               if(v.references) {
				               if(typeof v.references !== 'string')
					               depends.push(v.references.model as string);
				               else
					               depends.push(v.references);
			               }
		               });

		actions.push({
			             actionType: 'createTable',
			             attributes: df.rhs.schema,
			             options:    {},
			             tableName,
			             depends
		             });

		// create indexes
		if(df.rhs.indexes) {
			for(const _i in df.rhs.indexes) {
				const copied = JSON.parse(JSON.stringify(df.rhs.indexes[_i]));
				actions.push(
					Object.assign(
						{
							actionType: 'addIndex',
							tableName,
							depends:    [tableName]
						},
						copied
					)
				);
			}
		}
		return;
	}

	const tableName: string = df.path[0];
	const depends: string[] = [tableName];

	if(df.path[1] === 'schema') {
		// if (df.path.length === 3) - new field
		if(df.path.length === 3) {
			// new field
			if(df.rhs && df.rhs.references) {
				depends.push(df.rhs.references.model as string);
			}
			actions.push({
				             actionType:    'addColumn',
				             tableName:     tableName,
				             attributeName: df.path[2],
				             options:       df.rhs,
				             depends:       depends
			             });
			return;
		}

		// if (df.path.length > 3) - add new attribute to column (change col)
		if(df.path.length > 3) {
			if(df.path[1] === 'schema') {
				// new field attributes
				const options =
					currentStateTables[tableName].schema[df.path[2]];
				if(options.references) {
					if(typeof options.references === 'string')
						depends.push(options.references);
					else
						depends.push(options.references.model as string);
				}

				actions.push({
					             actionType:    'changeColumn',
					             attributeName: df.path[2],
					             tableName,
					             options,
					             depends
				             });
				return;
			}
		}
	}

	// new index
	if(df.path[1] === 'indexes') {
		const tableName = df.path[0];
		const index = df.rhs
		              ? JSON.parse(JSON.stringify(df.rhs))
		              : undefined;

		index.actionType = 'addIndex';
		index.tableName = tableName;
		index.depends = [tableName];
		actions.push(index);
		return;
	}
}

function drop(df: df.DiffDeleted<ITable>, actions: IAction[], currentStateTables: any): void {
	const tableName = df.path[0];

	if(df.path.length === 1) {
		// drop table
		const depends: string[] = [];
		Object.values(df.lhs.schema).forEach((v: any) =>
		                                     {
			                                     if(v.references) {
				                                     depends.push(v.references.model);
			                                     }
		                                     });

		actions.push({
			             actionType: 'dropTable',
			             tableName:  tableName,
			             depends:    depends
		             });
		return;
	}

	if(df.path[1] === 'schema') {
		// if (df.path.length === 3) - drop field
		if(df.path.length === 3) {
			// drop column
			actions.push({
				             actionType: 'removeColumn',
				             tableName,
				             columnName: df.path[2],
				             depends:    [tableName]
			             });
			return;
		}

		// if (df.path.length > 3) - drop attribute from column (change col)
		if(df.path.length > 3) {
			const depends = [tableName];
			// new field attributes
			const options = currentStateTables[tableName].schema[df.path[2]];
			if(options.references) {
				depends.push(options.references.model);
			}

			actions.push({
				             actionType:    'changeColumn',
				             tableName,
				             attributeName: df.path[2],
				             options,
				             depends
			             });
			return;
		}
	}

	if(df.path[1] === 'indexes') {
		actions.push({
			             actionType: 'removeIndex',
			             tableName,
			             fields:     df.lhs.fields,
			             options:    df.lhs.options,
			             depends:    [tableName]
		             });
		return;
	}
}

function edit(df: df.DiffEdit<ITable>, actions: IAction[], currentStateTables: any): void {
	const tableName: string = df.path[0];
	const depends = [tableName];

	if(df.path[1] === 'schema') {
		// new field attributes
		const options: ModelAttributeColumnOptions = currentStateTables[tableName].schema[df.path[2]];
		if(options.references) {
			const { model } = options.references as ModelAttributeColumnReferencesOptions;
			depends.push(model as string);
		}

		actions.push({
			             actionType: 'changeColumn',
			             tableName,
			             attributeName: df.path[2],
			             options,
			             depends
		             });
	}
}

function array(df: df.DiffArray<any, any>): void {
	console.log(
		'[Not supported] Array model changes! Problems are possible. Please, check result more carefully!'
	);
	console.log('[Not supported] Difference: ');
	console.log(JSON.stringify(df, null, 4));
}

export function sortActions(actions: IAction[]) {
	const orderedActionTypes: string[] = [
		'removeIndex',
		'removeColumn',
		'dropTable',
		'createTable',
		'addColumn',
		'changeColumn',
		'addIndex'
	];

	const sortByLengthExists = (left: any[], right: any[]) =>
	{
		if(left.length === 0 && right.length > 0) {
			return -1;
		} // left < right
		if(right.length === 0 && left.length > 0) {
			return 1;
		} // right < left

		return 0;
	};

	actions.sort((left: IAction, right: IAction) =>
	             {
		             if(
			             orderedActionTypes.indexOf(left.actionType) <
			             orderedActionTypes.indexOf(right.actionType)
		             ) {
			             return -1;
		             }
		             if(
			             orderedActionTypes.indexOf(left.actionType) >
			             orderedActionTypes.indexOf(right.actionType)
		             ) {
			             return 1;
		             }

		             if(left.actionType === 'dropTable' && right.actionType === 'dropTable') {
			             return sortByLengthExists(right.depends, left.depends);
		             }
		             return sortByLengthExists(left.depends, right.depends);
	             });

	for(let i = 0; i < actions.length; i++) {
		const leftAction: IAction = actions[i];
		if(leftAction.depends.length === 0) {
			continue;
		}

		for(let j = 0; j < actions.length; j++) {
			const rightAction: IAction = actions[j];
			if(rightAction.depends.length === 0) {
				continue;
			}

			if(leftAction.actionType != rightAction.actionType) {
				continue;
			}

			if(rightAction.depends.indexOf(leftAction.tableName) !== -1) {
				if(i > j) {
					const c = actions[i];
					actions[i] = actions[j];
					actions[j] = c;
				}
			}
		}
	}
	return actions;
}

export function getDiffActionsFromTables(
	previousStateTables: ITableRecord,
	currentStateTables: ITableRecord
) {
	const actions: IAction[] = [];
	let difference: Array<TTableRecordDiff> = df.diff(
		previousStateTables,
		currentStateTables
	);
	if(difference === undefined) {
		return actions;
	}

	difference.forEach(df =>
	                   {
		                   switch(df.kind) {
			                   // add new
			                   case 'N':
				                   addNew(df, actions, currentStateTables);
				                   break;

			                   // drop
			                   case 'D':
				                   drop(df, actions, currentStateTables);
				                   break;

			                   // edit
			                   case 'E':
				                   edit(df, actions, currentStateTables);
				                   break;

			                   // array change indexes
			                   case 'A':
				                   array(df);
				                   break;

			                   default:
				                   // code
				                   break;
		                   }
	                   });
	return sortActions(actions);
}