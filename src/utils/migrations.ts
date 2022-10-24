import * as fs            from 'fs';
import * as path          from 'path';
import beautify           from 'js-beautify';
import {
	Sequelize,
	DataType
}                         from 'sequelize-typescript';
import { QueryInterface } from 'sequelize/types';
import {
	IAction,
	IDefaultReverseResult,
	IMigrationOptions,
	IRecord
}                         from '../common';

const propertyToStr = (obj: IRecord<IDefaultReverseResult> | any) =>
{
	const vals: string[] = [];
	for(const k in obj) {
		if(k === 'seqType') {
			vals.push(`"type": ${obj[k]}`);
			continue;
		}

		if(k === 'defaultValue' && obj[k] !== null) {
			if(obj[k].internal) {
				vals.push(`"defaultValue": ${obj[k].value}`);
				continue;
			}
			if(obj[k].notSupported) {
				continue;
			}

			const x: IRecord = {};
			x[k] = obj[k].value;
			vals.push(JSON.stringify(x).slice(1, -1));
			continue;
		}

		const x: IRecord = {};
		x[k] = obj[k];
		vals.push(JSON.stringify(x).slice(1, -1));
	}

	return `{ ${vals
		.filter(v => v !== '')
		.reverse()
		.join(', ')} }`;
};

const getAttributes = (attrs: any) =>
{
	const ret = [];
	for(const attrName in attrs) {
		ret.push(`      "${attrName}": ${propertyToStr(attrs[attrName])}`);
	}
	return ` { \n${ret.join(', \n')}\n     }`;
};

export function removeCurrentRevisionMigrations(
	revision: number,
	migrationsPath: string,
	options: any
): Promise<Boolean> {
	// if old files can't be deleted, we won't stop the execution
	return new Promise<Boolean>(
		resolve =>
		{
			if(options.keepFiles) {
				resolve(false);
			}
			try {
				const files: String[] = fs.readdirSync(migrationsPath);
				if(files.length === 0) {
					resolve(false);
				}

				let i = 0;
				files.forEach(file =>
				              {
					              i += 1;
					              if(file.split('-')[0] === revision.toString()) {
						              fs.unlinkSync(`${migrationsPath}/${file}`);
						              if(options.verbose) {
							              console.log(`Successfully deleted ${file}`);
							              resolve(true);
						              }
					              }
					              if(i === files.length) {
						              resolve(false);
					              }
				              });
			} catch(err) {
				if(options.debug) console.error(`Error: ${err}`);
				resolve(false);
			}
		}
	);
}

export function getMigrationCommands(actions: IAction[]) {
	const commandsUp: any[] = [];
	const commandsDown: any[] = [];
	const consoleOut: string[] = [];

	for(const _i in actions) {
		const action = actions[_i];
		switch(action.actionType) {
			case 'createTable':

				const resUp = `
{ fn: "createTable", params: [
"${action.tableName}",
${getAttributes(action.attributes)},
${JSON.stringify(action.options)}
] }`;
				commandsUp.push(resUp);

				consoleOut.push(
					`createTable "${action.tableName}", deps: [${action.depends.join(
						', '
					)}]`
				);
				break;

			case 'dropTable':
				commandsUp.push(`{ fn: "dropTable", params: ["${action.tableName}"] }`);
				consoleOut.push(`dropTable "${action.tableName}"`);
				break;

			case 'addColumn':
				commandsUp.push(`{ fn: "addColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`);
				consoleOut.push(
					`addColumn "${action.attributeName}" to table "${action.tableName}"`
				);
				break;

			case 'removeColumn':
				commandsUp.push(`{ fn: "removeColumn", params: ["${action.tableName}", "${action.columnName}"] }`);
				consoleOut.push(
					`removeColumn "${action.columnName}" from table "${action.tableName}"`
				);
				break;

			case 'changeColumn':
				commandsUp.push(`{ fn: "changeColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`);
				consoleOut.push(
					`changeColumn "${action.attributeName}" on table "${action.tableName}"`
				);
				break;

			case 'addIndex':
				commandsUp.push(`{ fn: "addIndex", params: [
    "${action.tableName}",
    ${JSON.stringify(action.fields)},
    ${JSON.stringify(action.options)}
] }`);
				consoleOut.push(
					`addIndex ${action.options &&
					            action.options.indexName &&
					            action.options.indexName != ''
					            ? `"${action.options.indexName}"`
					            : JSON.stringify(action.fields)} to table "${action.tableName}"`
				);
				break;

			case 'removeIndex':
				const nameOrAttrs =
					action.options &&
					action.options.indexName &&
					action.options.indexName != ''
					? `"${action.options.indexName}"`
					: JSON.stringify(action.fields);
				commandsUp.push(`{ fn: "removeIndex", params: [
          "${action.tableName}",
          ${nameOrAttrs}
      ] }`);
				consoleOut.push(
					`removeIndex ${nameOrAttrs} from table "${action.tableName}"`
				);
				break;

			default:
			// code
		}
	}

	return { commandsUp, commandsDown, consoleOut };
}

export async function getLastMigrationState(sequelize: Sequelize) {
	const [
		lastExecutedMigration
	] = await sequelize.query(
		'SELECT name FROM "SequelizeMeta" ORDER BY name desc limit 1',
		{ type: 'SELECT' }
	) as [any, any];

	const lastRevision: number =
		lastExecutedMigration !== undefined
		? lastExecutedMigration['name'].split('-')[0]
		: -1;

	const [
		lastMigration
	] = await sequelize.query(
		`SELECT state FROM "SequelizeMetaMigrations" where revision = '${lastRevision}'`,
		{ type: 'SELECT' }
	) as [any, any];
	return lastMigration ? lastMigration['state'] : undefined;
}

export async function createMigrationTable(sequelize: Sequelize) {
	const queryInterface: QueryInterface = sequelize.getQueryInterface();
	await queryInterface.createTable('SequelizeMeta', {
		name: {
			type:       DataType.STRING,
			allowNull:  false,
			unique:     true,
			primaryKey: true
		}
	});
	await queryInterface.createTable('SequelizeMetaMigrations', {
		revision: {
			type:       DataType.INTEGER,
			allowNull:  false,
			unique:     true,
			primaryKey: true
		},
		name:     {
			type:      DataType.STRING,
			allowNull: false
		},
		state:    {
			type:      DataType.JSON,
			allowNull: false
		}
	});
}

export async function writeMigration(
	revision: number,
	migration: any,
	options: IMigrationOptions
) {
	await removeCurrentRevisionMigrations(revision, options.outDir, options);

	const name = options.filename || 'migration';
	const comment = options.comment || '';
	let commands = `const migrationCommands = [ \n${migration.commandsUp.join(
		', \n'
	)} \n];\n`;
	let commandsDown = `const rollbackCommands = [ \n${migration.commandsDown.join(
		', \n'
	)} \n];\n`;

	const actions = ` * ${migration.consoleOut.join('\n * ')}`;

	commands = beautify(commands);
	commandsDown = beautify(commandsDown);

	const info = {
		revision,
		name,
		created: new Date(),
		comment
	};

	const template = `
// noinspection JSUnusedGlobalSymbols

'use strict';

const Sequelize = require('sequelize');

/**
 * Actions summary:
 *
${actions}
 *
 **/

const info = ${JSON.stringify(info, null, 4)};

${commands}

${commandsDown}

module.exports = {
	pos: 0,
	up: function(queryInterface)
	{
		let index = this.pos;
		return new Promise(function(resolve, reject)
		{
			function next() {
				if (index < migrationCommands.length) {
					let command = migrationCommands[index];
					console.log("[#"+index+"] execute: " + command.fn + " for table '" + command.params[0] + "'");
					index++;
					queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
				} else
					resolve();
			}

      next();
		});
	},
	down: function(queryInterface)
	{
		let index = this.pos;
		return new Promise(function(resolve, reject)
		{
			function next() {
				if (index < rollbackCommands.length) {
					let command = rollbackCommands[index];
					console.log("[#"+index+"] execute: " + command.fn + " for table '" + command.params[0] + "'");
					index++;
					queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
				} else
          resolve();
			}

			next();
			});
	},
	info: info
};
`;

	const revisionNumber = revision.toString().padStart(8, '0');

	const filename = path.join(
		options.outDir,
		`${
			revisionNumber + (name !== '' ? `-${name.replace(/[\s-]/g, '_')}` : '')
		}.js`
	);

	fs.writeFileSync(filename, template);

	return { filename, info, revisionNumber };
}