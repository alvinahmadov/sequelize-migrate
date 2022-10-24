import * as fs         from 'fs';
import beautify        from 'js-beautify';
import { Sequelize }   from 'sequelize-typescript';
import {
	Model,
	QueryInterface,
	ModelStatic
}                      from 'sequelize/types';
import {
	IMigrationOptions,
	IMigrationState
}                      from './common';
import * as actions    from './utils/actions';
import * as migrations from './utils/migrations';
import * as reverse    from './utils/reverse';

export default class SequelizeMigration {
	/**
	 * generates migration file including up, down code
	 * after this, run 'npx sequelize-cli db:migrate'.
	 * @param sequelize sequelize-typescript instance
	 * @param options options
	 */
	public static async makeMigration(
		sequelize: Sequelize,
		options: IMigrationOptions
	): Promise<{ message: string }> {
		let message: string;
		options.preview = options.preview || false;
		if(fs.existsSync(options.outDir) === false) {
			message = `'${options.outDir}' not exists. check path and if you did 'npx
			sequelize init' you must use path used in sequelize migration path`;
			return Promise.reject({ message });
		}
		await sequelize.authenticate();

		const models: {
			[key: string]: ModelStatic<Model>;
		} = sequelize.models;

		const queryInterface: QueryInterface = sequelize.getQueryInterface();

		await migrations.createMigrationTable(sequelize);
		const lastMigrationState = await migrations.getLastMigrationState(sequelize);

		const previousState: IMigrationState = {
			revision:
				lastMigrationState !== undefined ? lastMigrationState['revision'] : 0,
			version:
				lastMigrationState !== undefined ? lastMigrationState['version'] : 1,
			tables:
				lastMigrationState !== undefined ? lastMigrationState['tables'] : {}
		};
		const currentState: IMigrationState = {
			revision: previousState.revision + 1,
			tables:   reverse.reverseModels(sequelize, models)
		};

		const upActions = actions.getDiffActionsFromTables(
			previousState.tables,
			currentState.tables
		);
		const downActions = actions.getDiffActionsFromTables(
			currentState.tables,
			previousState.tables
		);

		const migration = migrations.getMigrationCommands(upActions);
		const tmp = migrations.getMigrationCommands(downActions);

		migration.commandsDown = tmp.commandsUp;

		if(migration.commandsUp.length === 0) {
			console.log('No changes found');
			process.exit(0);
		}

		migration.consoleOut.forEach(v => console.log(`[Actions] ${v}`));
		if(options.preview) {
			console.log('Migration result:');
			console.log(beautify(`[ \n${migration.commandsUp.join(', \n')} \n];\n`));
			console.log('Undo commands:');
			console.log(
				beautify(`[ \n${migration.commandsDown.join(', \n')} \n];\n`)
			);
			message = 'Success without save.';
			return Promise.resolve({ message });
		}

		const info = await migrations.writeMigration(
			currentState.revision ?? 0,
			migration,
			options
		);

		console.log(
			`New migration to revision ${currentState.revision} has been saved to file '${info.filename}'`
		);

		// save current state, Ugly hack, see https://github.com/sequelize/sequelize/issues/8310
		const rows = [
			{
				revision: currentState.revision,
				name:     info.info.name,
				state:    JSON.stringify(currentState)
			}
		];

		try {
			if(!options.preview) {
				await queryInterface.bulkDelete('SequelizeMetaMigrations', {
					revision: currentState.revision
				});
				await queryInterface.bulkInsert('SequelizeMetaMigrations', rows);
			}

			console.log(`Use sequelize CLI: npx sequelize db:migrate --to ${
				info.revisionNumber
			}-${
				info.info.name
			}.js --migrations-path=${
				options.outDir
			} `);
			message = 'Success!';
			return Promise.resolve({ message });
		} catch(err) {
			message = err.message;
			if(options.debug) console.error(err);
			return Promise.reject(message);
		}
	};
}

export {
	IMigrationOptions,
	IMigrationState
};
